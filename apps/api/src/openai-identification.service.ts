import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { IdentificationResult, PlanCode } from "@resort/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { appConfig } from "./config";
import type { CarbonFactor } from "./data.store";
import type { SortingResolution } from "./rule.engine";

export const IDENTIFICATION_PROMPT_VERSION = "waste-identity-only-2026.08.15-v2";
const Confidence = z.number().min(0).max(1);
const IdentificationSchema = z.object({
  primaryObject:z.string().min(1), isPackaging:z.boolean(),
  packagingType:z.enum(["CUP","BOX","JAR","BOTTLE","CAN","BAG","OTHER"]),
  packagingState:z.enum(["EMPTY","PARTLY_FULL","FULL","UNKNOWN"]),
  materials:z.array(z.object({ material:z.string().min(1), proportion:z.enum(["PRIMARY","SECONDARY"]), confidence:Confidence })).max(8),
  visibleSymbols:z.array(z.object({ code:z.string().min(1), rawText:z.string().nullable(), confidence:Confidence })).max(12),
  hazardSignals:z.array(z.enum(["BATTERY","PRESSURIZED","FLAMMABLE","CORROSIVE","TOXIC","SHARP","MEDICINE","ELECTRONIC","NONE"])).min(1),
  estimatedWeightGrams:z.number().min(1).max(100_000).nullable(), weightConfidence:Confidence, overallConfidence:Confidence,
  uncertainties:z.array(z.string()).max(8), retakeAdvice:z.string().nullable(),
});
const AnalysisSchema=z.object({environmentalImpactSummary:z.string().min(20).max(500),reuseSuggestions:z.array(z.string().min(8).max(220)).min(1).max(3)});

export interface IdentificationSettings { provider:"MOCK"|"OPENAI"; model:string|null; promptVersion:string }

function mockIdentification(): IdentificationResult {
  return {
    primaryObject:"Yogurt cup", isPackaging:true, packagingType:"CUP", packagingState:"EMPTY",
    materials:[{ material:"PP plastic",proportion:"PRIMARY",confidence:0.93 }],
    visibleSymbols:[{ code:"PP_5",rawText:"PP 5",confidence:0.88 }], hazardSignals:["NONE"],
    estimatedWeightGrams:25, weightConfidence:0.7, overallConfidence:0.92, uncertainties:[], retakeAdvice:null,
  };
}

@Injectable()
export class OpenAiIdentificationService {
  private readonly logger = new Logger(OpenAiIdentificationService.name);

  settings(plan: PlanCode): IdentificationSettings {
    const config=appConfig();
    const model=plan === "PLUS" ? config.modelPlus : plan === "HOUSEHOLD" ? config.modelHousehold : config.modelFree;
    return config.resolvedAiMode === "mock"
      ? { provider:"MOCK",model:null,promptVersion:IDENTIFICATION_PROMPT_VERSION }
      : { provider:"OPENAI",model,promptVersion:IDENTIFICATION_PROMPT_VERSION };
  }

  async identify(jpeg: Buffer, plan: PlanCode): Promise<IdentificationResult> {
    const config=appConfig();
    if (config.resolvedAiMode === "mock") return mockIdentification();
    if (!process.env.OPENAI_API_KEY) throw new ServiceUnavailableException({ code:"AI_CONFIGURATION_ERROR",message:"OPENAI_API_KEY is missing" });
    const settings=this.settings(plan);
    const client=new OpenAI({ apiKey:process.env.OPENAI_API_KEY,timeout:config.openAiTimeoutMs,maxRetries:config.openAiMaxRetries });
    try {
      const response=await client.responses.parse({
        model:settings.model!, store:false,
        input:[
          { role:"system",content:"You are a visual waste IDENTIFICATION system. Describe only what is evidenced in the image: the main object, whether it is product packaging, packaging shape and remaining contents, materials, actually visible symbols/text, hazards, and an approximate weight when defensible. Never recommend a bin, disposal route, recycling law, country rule, preparation step, or environmental claim. Never infer a symbol that is not visibly legible. Use NONE as the sole hazard signal only when no hazard is visible or strongly inherent in the identified object. If identity or material is uncertain, lower confidence and provide concise retakeAdvice." },
          { role:"user",content:[
            { type:"input_text",text:"Identify the single primary discarded item in this photo. Return observation-only structured data. Do not classify its bin or disposal route." },
            { type:"input_image",image_url:`data:image/jpeg;base64,${jpeg.toString("base64")}`,detail:plan === "FREE" ? "auto" : "high" },
          ] },
        ],
        text:{ format:zodTextFormat(IdentificationSchema,"waste_identification") },
      });
      if (!response.output_parsed) throw new Error("EMPTY_STRUCTURED_OUTPUT");
      return response.output_parsed;
    } catch (cause) {
      const error=cause as {status?:number;code?:string;message?:string;request_id?:string};
      this.logger.error(`OpenAI identification failed status=${error.status ?? "unknown"} code=${error.code ?? "unknown"} requestId=${error.request_id ?? "unknown"}`);
      if (error.status === 401) throw new ServiceUnavailableException({ code:"AI_AUTHENTICATION_FAILED",message:"OpenAI rejected the API key." });
      if (error.status === 429) throw new ServiceUnavailableException({ code:"AI_CAPACITY_OR_BILLING_LIMIT",message:"OpenAI rate or billing limit reached. Try again shortly." });
      if (["ETIMEDOUT","ECONNRESET"].includes(error.code ?? "")) throw new ServiceUnavailableException({ code:"AI_TIMEOUT",message:"Image identification timed out. Retry the same photo." });
      throw new ServiceUnavailableException({ code:"AI_IDENTIFICATION_FAILED",message:"The image could not be identified. Retry or use a clearer photo." });
    }
  }

  async enrich(plan:PlanCode,identification:IdentificationResult,sorted:SortingResolution,weightGrams:number,factor:CarbonFactor|null):Promise<{environmentalImpactSummary:string;reuseSuggestions:string[]}>{
    const config=appConfig();
    if(config.resolvedAiMode==="mock") return {environmentalImpactSummary:`Correctly using ${sorted.binLabel} for this ${identification.primaryObject.toLowerCase()} keeps the identified material in the safest available German disposal route.`,reuseSuggestions:sorted.reuseSuggestions};
    const settings=this.settings(plan);const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:config.openAiTimeoutMs,maxRetries:config.openAiMaxRetries});
    const facts={identifiedObject:identification.primaryObject,materials:identification.materials.map((item)=>item.material),packagingState:identification.packagingState,resolvedCategory:sorted.category,resolvedRoute:sorted.disposalRoute,resolvedBinLabel:sorted.binLabel,preparationSteps:sorted.preparationSteps,weightGrams,estimatedDisposalCo2eKg:factor?(weightGrams/1_000_000)*factor.kgCo2ePerTonne:null,carbonBoundary:factor?.boundary ?? null,localGuidanceRequired:sorted.requiresLocalGuidance};
    try{
      const response=await client.responses.parse({model:settings.model!,store:false,input:[
        {role:"system",content:"Write the Analysis insight for a Germany waste-sorting app. Use ONLY the supplied structured facts. The deterministic rule has already selected the category, route and bin: never change, contradict or embellish them. environmentalImpactSummary must be 1-3 concise, human-friendly sentences about disposal/material recovery rather than a full product lifecycle. Do not repeat exact weight or carbon numbers because the user can edit weight later; those figures are displayed separately. reuseSuggestions must be practical and safe for this exact item; when reuse would be unsafe, suggest reduction, repair, return or correct recycling instead. Do not invent local programs, emissions savings, legal claims or carbon factors."},
        {role:"user",content:`Grounded facts:\n${JSON.stringify(facts)}`},
      ],text:{format:zodTextFormat(AnalysisSchema,"grounded_waste_analysis")}});
      if(!response.output_parsed)throw new Error("EMPTY_STRUCTURED_OUTPUT");return response.output_parsed;
    }catch(cause){const error=cause as {status?:number;code?:string;request_id?:string};this.logger.error(`OpenAI analysis enrichment failed status=${error.status ?? "unknown"} code=${error.code ?? "unknown"} requestId=${error.request_id ?? "unknown"}`);throw new ServiceUnavailableException({code:"AI_ANALYSIS_FAILED",message:"The item was identified, but the environmental analysis could not be completed. Please retry Accept."});}
  }
}
