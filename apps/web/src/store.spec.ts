import { createPinia,setActivePinia } from "pinia";
import { beforeEach,describe,expect,it,vi } from "vitest";
import type { AnalyticsDto,ScanDto,WasteRecordDto } from "@resort/contracts";
import { api } from "./api";
import { useResortStore } from "./store";

const record:WasteRecordDto={id:"record-1",scanId:"scan-1",identifiedName:"Yogurt cup",wasteTypeLabel:"Lightweight sales packaging",category:"LIGHTWEIGHT_PACKAGING",primaryMaterial:"PP",materialLabel:"PP · PP 5",disposalRoute:"YELLOW_BIN_OR_SACK",binLabel:"Yellow bin or sack",preparationSteps:["Empty it"],reuseSuggestions:["Choose a reusable cup."],environmentalImpactSummary:"Disposal-scoped recovery explanation.",estimatedWeightGrams:25,weightSource:"AI_ESTIMATE",weightConfidence:.6,estimatedDisposalCo2eKg:.0001,carbonMethodologyVersion:"factor-v1",carbonBoundary:"Disposal proxy",classificationConfidence:.9,requiresLocalGuidance:false,localWarning:null,ruleSetVersion:"rules-v1",ruleSetEffectiveFrom:"2026-08-12",sourceUrls:["https://example.com"],analysisProvider:"MOCK",analysisModel:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),thumbnailUrl:null};
const analytics:AnalyticsDto={totalAccepted:1,totalWeightGrams:25,totalDisposalCo2eKg:.0001,recordsWithoutCarbonFactor:0,daily:[],dailyCounts:[0,0,0,0,0,0,1],categories:[{category:"BIN",label:"Yellow bin or sack",count:1,weightGrams:25}],suggestions:[{code:"REFILL",title:"Refill",action:"Try a refill.",evidence:"One package."}]};

describe("Re-Sort store",()=>{
  beforeEach(()=>{vi.restoreAllMocks();setActivePinia(createPinia());});
  it("starts empty instead of pretending fallback data is live",()=>{const store=useResortStore();expect(store.subscription.used).toBe(0);expect(store.history).toEqual([]);expect(store.analytics.totalAccepted).toBe(0);});
  it("refreshes real history and analytics after Accept",async()=>{const store=useResortStore();store.scan={id:"scan-1",status:"ANALYZED",provider:"MOCK",model:null,promptVersion:"test",countryCode:"DE",createdAt:new Date().toISOString(),errorCode:null,thumbnailUrl:null,identification:{primaryObject:"Yogurt cup",isPackaging:true,packagingType:"CUP",packagingState:"EMPTY",materials:[{material:"PP",proportion:"PRIMARY",confidence:.9}],visibleSymbols:[],hazardSignals:["NONE"],estimatedWeightGrams:25,weightConfidence:.6,overallConfidence:.9,uncertainties:[],retakeAdvice:null}} as ScanDto;
    vi.spyOn(api,"post").mockResolvedValue({data:{wasteRecordId:record.id,record}});vi.spyOn(api,"get").mockResolvedValueOnce({data:{items:[record]}}).mockResolvedValueOnce({data:analytics});
    await store.accept();expect(store.record?.id).toBe(record.id);expect(store.history[0]?.id).toBe(record.id);expect(store.analytics.totalAccepted).toBe(1);
  });
});
