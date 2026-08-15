import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { IdentificationResult } from "@resort/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const Confidence = z.number().min(0).max(1);

const IdentificationSchema = z.object({
  primaryObject: z.string(),
  isPackaging: z.boolean(),
  packagingType: z.enum([
    "CUP",
    "BOX",
    "JAR",
    "CAN",
    "OTHER",
  ]),
  materials: z.array(
    z.object({
      material: z.string(),
      proportion: z.enum(["PRIMARY", "SECONDARY"]),
      confidence: Confidence,
    }),
  ),
  visibleSymbols: z.array(
    z.object({
      code: z.string(),
      rawText: z.string().nullable(),
      confidence: Confidence,
    }),
  ),
  estimatedWeightGrams: z.number().min(0),
  weightConfidence: Confidence,
  overallConfidence: Confidence,
  uncertainties: z.array(z.string()),
  retakeAdvice: z.string().nullable(),
  disposalRecommendation: z.object({
    wasteTypeLabel: z.string().min(1),
    category: z.enum([
      "LIGHTWEIGHT_PACKAGING",
      "PAPER_CARDBOARD",
      "GLASS_PACKAGING",
      "ORGANIC",
      "RESIDUAL",
      "BATTERY",
      "E_WASTE",
      "TEXTILE",
      "HAZARDOUS_WASTE",
      "MEDICAL_SHARPS",
      "MEDICINE",
      "BULKY_WASTE",
      "CONSTRUCTION_WASTE",
      "DEPOSIT_RETURN",
      "REUSE_DONATE",
      "LOCAL_GUIDANCE_REQUIRED",
    ]),
    disposalRoute: z.enum([
      "YELLOW_BIN_OR_SACK",
      "PAPER_BIN",
      "GLASS_COLLECTION_CONTAINER",
      "BIO_BIN_OR_COMPOST",
      "RESIDUAL_WASTE_BIN",
      "BATTERY_COLLECTION_POINT",
      "E_WASTE_COLLECTION_POINT",
      "TEXTILE_COLLECTION_OR_DONATION",
      "HAZARDOUS_WASTE_COLLECTION_POINT",
      "SHARPS_CONTAINER_OR_MEDICAL_COLLECTION",
      "MEDICINE_TAKE_BACK_OR_LOCAL_ROUTE",
      "BULKY_WASTE_COLLECTION_OR_RECYCLING_CENTRE",
      "CONSTRUCTION_WASTE_RECYCLING_CENTRE",
      "DEPOSIT_RETURN_POINT",
      "REUSE_OR_DONATE",
      "CHECK_LOCAL_GUIDANCE",
    ]),
    binLabel: z.string().min(1),
    confidence: Confidence,
    reason: z.string().min(1),
    disposalInstructions: z.array(z.string().min(1)).min(1).max(5),
    reuseSuggestion: z.string(),
    requiresLocalGuidance: z.boolean(),
  }),
});

@Injectable()
export class OpenAiIdentificationService {
  private readonly logger = new Logger(OpenAiIdentificationService.name);

  async identify(jpeg: Buffer): Promise<IdentificationResult> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new ServiceUnavailableException(
        "OPENAI_API_KEY is missing",
      );
    }

    const client = new OpenAI({
      apiKey,
      timeout: 75_000,
      maxRetries: 1,
    });

    let response;

    try {
      response = await client.responses.parse({
        model: process.env.OPENAI_MODEL ?? "gpt-5.6",
        store: false,
        input: [
          {
            role: "system",
            content:
              "You are the waste-identification and disposal engine for a Germany-focused mobile sorting app. From the photograph, identify the main discarded item, whether it is packaging, its materials, and only recycling symbols that are actually visible. Then provide a complete disposal recommendation for this particular item: a plain-language waste type, exactly one category, exactly one compatible disposalRoute, a user-facing binLabel or collection-point label, a concise reason, and 1-5 actionable disposalInstructions. Cover household packaging, paper, glass, organic waste, residual waste, batteries, electronics, textiles, hazardous waste, medical sharps, medicines, bulky waste, construction waste, deposit-return items, and reusable/donatable items. Use RESIDUAL only when the photographed item is positively identified as residual waste, never as a fallback. If the object or material is unclear, contamination changes the route, or the answer depends on municipality-specific acceptance rules, choose LOCAL_GUIDANCE_REQUIRED with disposalRoute CHECK_LOCAL_GUIDANCE and name the municipal guide or specialist collection point in binLabel. For dangerous items, explicitly say not to use ordinary household bins. Do not invent symbols, materials, local programs, or certainty. Confidence values must be between 0 and 1.",
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Analyze this photograph. Return the identity of the trash and the complete, item-specific sorting answer: waste type, exact bin or collection route, why it belongs there, and disposal steps. The user must receive a useful route for every image; use local-guidance or specialist-collection output instead of guessing when no ordinary bin is safely appropriate.",
              },
              {
                type: "input_image",
                image_url:
                  `data:image/jpeg;base64,${jpeg.toString("base64")}`,
                detail: "high",
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(
            IdentificationSchema,
            "waste_identification",
          ),
        },
      });
    } catch (cause) {
      const error = cause as {
        status?: number;
        code?: string;
        message?: string;
        request_id?: string;
      };
      this.logger.error(
        `OpenAI identification failed: status=${error.status ?? "unknown"} code=${error.code ?? "unknown"} requestId=${error.request_id ?? "unknown"} message=${error.message ?? "unknown"}`,
      );

      if (error.status === 401) {
        throw new ServiceUnavailableException("OpenAI rejected the API key. Check OPENAI_API_KEY.");
      }
      if (error.status === 429) {
        throw new ServiceUnavailableException("OpenAI rate limit or billing limit reached. Wait briefly and try again.");
      }
      if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
        throw new ServiceUnavailableException("OpenAI image analysis timed out. Please retry the same photo.");
      }
      throw new ServiceUnavailableException("OpenAI could not analyze this image. Please retry or choose a clearer photo.");
    }

    if (!response.output_parsed) {
      throw new ServiceUnavailableException(
        "OpenAI did not return a valid identification",
      );
    }

    return response.output_parsed;
  }
}
