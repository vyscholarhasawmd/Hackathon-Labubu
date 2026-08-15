import { Injectable } from "@nestjs/common";
import type { IdentificationResult, WasteCategory } from "@resort/contracts";
import type { CarbonFactor, RecordInput } from "./data.store";

export const RULE_SET_VERSION = "DE-FEDERAL-2026.08.12-v2";
export const RULE_SET_EFFECTIVE_FROM = "2026-08-12";
export const RULE_SOURCES = [
  "https://www.bundesregierung.de/breg-de/aktuelles/verpackungsrecht-gesetz-2406776",
  "https://www.recht.bund.de/bgbl/1/2026/207/VO.html",
  "https://eur-lex.europa.eu/eli/reg/2025/40/oj",
  "https://www.gesetze-im-internet.de/krwg/__20.html",
  "https://www.gesetze-im-internet.de/elektrog_2015/__10.html",
  "https://www.gesetze-im-internet.de/battdg/",
  "https://www.umweltbundesamt.de/umwelttipps-fuer-den-alltag/richtiger-muelltrennung-ressourcen-schonen-umwelt",
];

export interface SortingResolution {
  category: WasteCategory;
  wasteTypeLabel: string;
  disposalRoute: string;
  binLabel: string;
  preparationSteps: string[];
  reuseSuggestions: string[];
  environmentalImpactSummary: string;
  requiresLocalGuidance: boolean;
  localWarning: string | null;
  confidence: number;
}

const normalize = (value: string): string => value.trim().toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
const containsAny = (haystack: string, values: string[]): boolean => values.some((value) => haystack.includes(value));

function localGuidance(identification: IdentificationResult, reason: string): SortingResolution {
  return {
    category: "LOCAL_GUIDANCE_REQUIRED", wasteTypeLabel: identification.primaryObject || "Uncertain waste item",
    disposalRoute: "CHECK_LOCAL_GUIDANCE", binLabel: "Municipal Abfall-ABC or recycling centre",
    preparationSteps: ["Keep the item out of ordinary household bins until its route is confirmed", "Retake a clear photo showing the whole item, labels and disposal symbols", "Check your municipality's Abfall-ABC or ask the local recycling centre"],
    reuseSuggestions: ["Keep the item safely aside until its disposal route is confirmed."], environmentalImpactSummary: reason,
    requiresLocalGuidance: true, localWarning: "Collection rules can differ by municipality. Check the local Abfall-ABC or recycling centre before disposal.",
    confidence: Math.min(identification.overallConfidence, 0.55),
  };
}

function resolution(input: Omit<SortingResolution, "confidence">, confidence: number): SortingResolution { return { ...input, confidence }; }

const categoryWeights: Record<WasteCategory, number> = {
  LIGHTWEIGHT_PACKAGING:35, PAPER_CARDBOARD:70, GLASS_PACKAGING:280, ORGANIC:95, RESIDUAL:80, BATTERY:24,
  E_WASTE:250, TEXTILE:220, HAZARDOUS_WASTE:150, MEDICAL_SHARPS:15, MEDICINE:40, BULKY_WASTE:5_000,
  CONSTRUCTION_WASTE:2_000, DEPOSIT_RETURN:35, REUSE_DONATE:300, LOCAL_GUIDANCE_REQUIRED:100,
};

@Injectable()
export class RuleEngine {
  resolve(identification: IdentificationResult): SortingResolution {
    const object = normalize(identification.primaryObject);
    const materialText = identification.materials.map((item) => normalize(item.material)).join("_");
    const symbols = identification.visibleSymbols.map((item) => normalize(`${item.code}_${item.rawText ?? ""}`)).join("_");
    const hazards = new Set(identification.hazardSignals);
    const confidence = Math.min(identification.overallConfidence, Math.max(...identification.materials.map((item) => item.confidence), identification.overallConfidence));
    if (identification.overallConfidence < 0.55 || !identification.primaryObject.trim()) return localGuidance(identification, "The item could not be identified confidently enough for a safe bin recommendation.");

    if (hazards.has("SHARP") || containsAny(object,["NEEDLE","SYRINGE","LANCET","SHARP"])) return resolution({
      category:"MEDICAL_SHARPS",wasteTypeLabel:"Medical sharp",disposalRoute:"SHARPS_CONTAINER_OR_MEDICAL_COLLECTION",binLabel:"Sharps container and local medical collection",
      preparationSteps:["Place it directly in a puncture-resistant sharps container","Do not recap, bend or place it loose in any household bin","Check a pharmacy, medical facility or municipal collection route"],
      reuseSuggestions:["Use an approved reusable sharps container only where a take-back scheme supports it."],environmentalImpactSummary:"Loose sharps can injure collection workers and must stay out of ordinary household bins.",
      requiresLocalGuidance:true,localWarning:"The exact return route varies locally; ask a pharmacy, medical provider or municipality."}, confidence);

    if (["PRESSURIZED","FLAMMABLE","CORROSIVE","TOXIC"].some((signal) => hazards.has(signal as "PRESSURIZED")) || containsAny(object,["PAINT","SOLVENT","PESTICIDE","CHEMICAL","AEROSOL_CAN","FIRE_EXTINGUISHER"])) return resolution({
      category:"HAZARDOUS_WASTE",wasteTypeLabel:"Hazardous household waste",disposalRoute:"HAZARDOUS_WASTE_COLLECTION_POINT",binLabel:"Hazardous waste collection point",
      preparationSteps:["Keep it in its original labelled container","Do not mix, puncture, burn or pour it away","Take it to a Schadstoffmobil or approved recycling centre"],reuseSuggestions:["Offer usable material for safe reuse only when the label and container remain intact."],
      environmentalImpactSummary:"Hazardous contents require controlled collection and must not enter ordinary household bins or drains.",requiresLocalGuidance:true,localWarning:"Check the municipality's Schadstoffmobil dates and quantity limits."}, confidence);

    if (hazards.has("BATTERY") || containsAny(materialText,["BATTERY","LITHIUM","LI_ION"]) || containsAny(object,["BATTERY","POWER_BANK"])) return resolution({
      category:"BATTERY",wasteTypeLabel:"Battery",disposalRoute:"BATTERY_COLLECTION_POINT",binLabel:"Battery collection point",
      preparationSteps:["Keep the battery dry and separate from metal objects","Tape exposed lithium terminals where appropriate","Return it to a retailer or municipal collection point; never use household bins"],reuseSuggestions:["Choose rechargeable batteries where they are suitable."],
      environmentalImpactSummary:"Separate collection prevents fires and recovers valuable battery materials.",requiresLocalGuidance:false,localWarning:null}, confidence);

    if (hazards.has("ELECTRONIC") || containsAny(materialText,["ELECTRONIC","CIRCUIT"]) || containsAny(object,["PHONE","LAPTOP","CABLE","CHARGER","APPLIANCE","ELECTRONIC","HEADPHONE","KEYBOARD","MOUSE"])) return resolution({
      category:"E_WASTE",wasteTypeLabel:"Electrical or electronic equipment",disposalRoute:"E_WASTE_COLLECTION_POINT",binLabel:"E-waste retailer return or recycling centre",
      preparationSteps:["Remove batteries only if safely removable","Delete personal data from connected devices","Return it to a participating retailer or municipal recycling centre; never use household bins"],reuseSuggestions:["Repair, resell or donate a working device before recycling."],
      environmentalImpactSummary:"Separate e-waste collection recovers metals and keeps hazardous components out of mixed waste.",requiresLocalGuidance:false,localWarning:null}, confidence);

    if (hazards.has("MEDICINE") || containsAny(object,["MEDICINE","TABLET","PILL","PHARMACEUTICAL","INHALER"])) return resolution({
      category:"MEDICINE",wasteTypeLabel:"Medicine",disposalRoute:"MEDICINE_TAKE_BACK_OR_LOCAL_ROUTE",binLabel:"Local medicine take-back or approved route",
      preparationSteps:["Keep medicine in its original package where possible","Never flush it or pour it into a sink","Check the municipality's medicine route or ask a pharmacy"],reuseSuggestions:["Buy only the quantity you expect to use."],
      environmentalImpactSummary:"Correct medicine disposal helps prevent active substances from reaching water and soil.",requiresLocalGuidance:true,localWarning:"Medicine routes differ locally; confirm the accepted route before disposal."}, confidence);

    if (containsAny(symbols,["DPG","PFAND","DEPOSIT_RETURN"])) return resolution({
      category:"DEPOSIT_RETURN",wasteTypeLabel:"Deposit container",disposalRoute:"DEPOSIT_RETURN_POINT",binLabel:"Deposit return point",
      preparationSteps:["Empty the container","Keep its barcode and shape readable","Return it to a participating retailer"],reuseSuggestions:["Choose reusable deposit containers where available."],
      environmentalImpactSummary:"Returning the container preserves the deposit system and supports high-quality material recovery.",requiresLocalGuidance:false,localWarning:null}, confidence);

    if (identification.isPackaging && containsAny(materialText,["GLASS"])) return resolution({
      category:"GLASS_PACKAGING",wasteTypeLabel:"Glass packaging",disposalRoute:"GLASS_COLLECTION_CONTAINER",binLabel:"Glass collection container",
      preparationSteps:["Empty the container","Sort it by glass colour","Put caps in the yellow bin where accepted"],reuseSuggestions:["Reuse suitable jars before recycling."],
      environmentalImpactSummary:"Colour-sorted packaging glass can be recycled repeatedly when ceramics and drinking glasses are kept out.",requiresLocalGuidance:false,localWarning:null}, confidence);

    if (identification.isPackaging && (containsAny(materialText,["PLASTIC","PET","HDPE","LDPE","PP","PS","PVC","ALUMINIUM","ALUMINUM","STEEL","METAL","COMPOSITE"]) || identification.packagingType !== "OTHER")) return resolution({
      category:"LIGHTWEIGHT_PACKAGING",wasteTypeLabel:"Lightweight sales packaging",disposalRoute:"YELLOW_BIN_OR_SACK",binLabel:"Yellow bin or sack",
      preparationSteps:["Empty the packaging completely","No need to rinse it","Separate easily removable components and do not nest packages"],reuseSuggestions:["Choose refill or reusable packaging where practical."],
      environmentalImpactSummary:"Separating sales packaging supports material recovery and keeps recyclable packaging out of residual waste.",requiresLocalGuidance:false,localWarning:null}, confidence);

    if (containsAny(materialText,["PAPER","CARDBOARD"]) || containsAny(object,["PAPER","CARDBOARD","NEWSPAPER","MAGAZINE","ENVELOPE"])) return resolution({
      category:"PAPER_CARDBOARD",wasteTypeLabel:"Paper or cardboard",disposalRoute:"PAPER_BIN",binLabel:"Blue paper bin",
      preparationSteps:["Keep it clean and dry","Flatten boxes","Remove large non-paper components"],reuseSuggestions:["Reuse paper and boxes before recycling."],
      environmentalImpactSummary:"Clean, dry paper fibres can be recovered when food-soiled and coated items are kept separate.",requiresLocalGuidance:false,localWarning:null}, confidence);

    if (containsAny(materialText,["ORGANIC","FOOD","FRUIT","VEGETABLE","PLANT"]) || containsAny(object,["BANANA","PEEL","FOOD_SCRAP","APPLE_CORE","COFFEE_GROUNDS","TEA_BAG","EGGSHELL"])) return resolution({
      category:"ORGANIC",wasteTypeLabel:"Food or garden biowaste",disposalRoute:"BIO_BIN_OR_COMPOST",binLabel:"Bio bin or locally accepted compost",
      preparationSteps:["Remove stickers and all conventional plastic packaging","Place it loose or in a locally approved liner","Check the municipality's accepted bio-waste list"],reuseSuggestions:["Prevent avoidable food waste and compost at home where locally suitable."],
      environmentalImpactSummary:"Separate biowaste can be composted or treated for energy instead of contaminating recyclables.",requiresLocalGuidance:true,localWarning:"Bio-bin acceptance and liner rules vary by municipality; check the local Abfall-ABC."}, confidence);

    if (containsAny(materialText,["TEXTILE","FABRIC","COTTON","WOOL","POLYESTER"]) || containsAny(object,["CLOTHING","SHIRT","SHOE","TOWEL","TEXTILE"])) return resolution({
      category:"TEXTILE",wasteTypeLabel:"Textile",disposalRoute:"TEXTILE_COLLECTION_OR_DONATION",binLabel:"Textile collection or donation",
      preparationSteps:["Keep reusable textiles clean and dry","Bag pairs of shoes together","Check local handling for wet, contaminated or damaged textiles"],reuseSuggestions:["Repair, resell, swap or donate wearable items before recycling."],
      environmentalImpactSummary:"Extending textile life avoids material and manufacturing impacts before recycling.",requiresLocalGuidance:true,localWarning:"Local textile collectors may accept different conditions; verify before drop-off."}, confidence);

    if (containsAny(object,["SOFA","MATTRESS","FURNITURE","WARDROBE","CARPET"])) return resolution({
      category:"BULKY_WASTE",wasteTypeLabel:"Bulky waste",disposalRoute:"BULKY_WASTE_COLLECTION_OR_RECYCLING_CENTRE",binLabel:"Bulky-waste collection or recycling centre",
      preparationSteps:["Book municipal bulky-waste collection or use an approved recycling centre","Remove batteries or electronics first where safe","Do not leave it beside ordinary bins without a booking"],reuseSuggestions:["Repair, sell or donate usable furniture first."],
      environmentalImpactSummary:"Separate bulky collection enables reuse and material sorting that ordinary bins cannot provide.",requiresLocalGuidance:true,localWarning:"Booking, fees and accepted sizes vary by municipality."}, confidence);

    if (containsAny(materialText,["CONCRETE","BRICK","PLASTERBOARD","RUBBLE"]) || containsAny(object,["CONSTRUCTION","RUBBLE","TILE","BRICK"])) return resolution({
      category:"CONSTRUCTION_WASTE",wasteTypeLabel:"Construction or renovation waste",disposalRoute:"CONSTRUCTION_WASTE_RECYCLING_CENTRE",binLabel:"Construction-waste recycling centre",
      preparationSteps:["Keep mineral, wood and hazardous fractions separate","Use an approved recycling centre or licensed collection service","Treat asbestos or chemically contaminated material as specialist hazardous waste"],reuseSuggestions:["Salvage reusable fixtures and uncontaminated materials."],
      environmentalImpactSummary:"Separated construction materials can be recovered while hazardous fractions receive controlled treatment.",requiresLocalGuidance:true,localWarning:"Local centres set material, quantity and fee rules."}, confidence);

    if (containsAny(materialText,["CERAMIC","PORCELAIN","HYGIENE","RESIDUAL"]) || containsAny(object,["BROKEN_CERAMIC","DIAPER","VACUUM_DUST","CIGARETTE_BUTT","CAT_LITTER"])) return resolution({
      category:"RESIDUAL",wasteTypeLabel:"Non-recyclable residual waste",disposalRoute:"RESIDUAL_WASTE_BIN",binLabel:"Residual waste bin",
      preparationSteps:["Remove batteries, electronics and hazardous parts first","Bag dusty or unhygienic material safely","Place only the non-recoverable remainder in residual waste"],reuseSuggestions:["Choose durable or refillable alternatives when replacing the item."],
      environmentalImpactSummary:"Residual waste is a positive classification for non-recoverable material, not a fallback for uncertainty.",requiresLocalGuidance:false,localWarning:null}, confidence);

    return localGuidance(identification, "No safe federal sorting rule matched the identified object and material; an ordinary bin must not be guessed.");
  }

  buildRecord(scanId: string, identification: IdentificationResult, sorted: SortingResolution, factor: CarbonFactor | null): RecordInput {
    const primaryMaterial = identification.materials.find((item) => item.proportion === "PRIMARY")?.material ?? identification.materials[0]?.material ?? "Unknown material";
    const symbol = identification.visibleSymbols[0];
    const materialLabel = [primaryMaterial, symbol?.rawText ?? symbol?.code].filter(Boolean).join(" · ");
    const grams = Math.max(1, Math.round(identification.estimatedWeightGrams ?? categoryWeights[sorted.category]));
    return {
      scanId, identifiedName:identification.primaryObject, wasteTypeLabel:sorted.wasteTypeLabel, category:sorted.category,
      primaryMaterial, materialLabel, disposalRoute:sorted.disposalRoute, binLabel:sorted.binLabel,
      preparationSteps:sorted.preparationSteps, reuseSuggestions:sorted.reuseSuggestions, environmentalImpactSummary:sorted.environmentalImpactSummary,
      estimatedWeightGrams:grams, weightSource:identification.estimatedWeightGrams == null ? "CATEGORY_DEFAULT" : "AI_ESTIMATE",
      weightConfidence:identification.estimatedWeightGrams == null ? null : identification.weightConfidence,
      estimatedDisposalCo2eKg:factor ? (grams / 1_000_000) * factor.kgCo2ePerTonne : null,
      carbonMethodologyVersion:factor?.methodologyVersion ?? null, carbonBoundary:factor?.boundary ?? null,
      classificationConfidence:Math.min(identification.overallConfidence,sorted.confidence), requiresLocalGuidance:sorted.requiresLocalGuidance,
      localWarning:sorted.localWarning, ruleSetVersion:RULE_SET_VERSION, ruleSetEffectiveFrom:RULE_SET_EFFECTIVE_FROM, sourceUrls:RULE_SOURCES,
    };
  }
}
