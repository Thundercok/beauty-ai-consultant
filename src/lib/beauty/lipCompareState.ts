import type { MatchedProduct } from "./types";
import type { ProductPriceEstimate, VnStudentTraits } from "./vnBeautyGuide";

export type TryOnMode = "single" | "bare_vs_lip" | "compare_two";
export type CompareSlot = "A" | "B";
export type ComparePairMode = "a_vs_b" | "bare_vs_a" | "bare_vs_b";

export interface ComparePairMeta {
  leftKind: "bare" | "A";
  rightKind: "A" | "B";
  hintText: string;
  ariaLabel: string;
}

/**
 * Maps the active comparison slider pairing so users in "Slider so sánh" can
 * compare Shade A vs Shade B OR immediately compare either Shade A or Shade B
 * directly against their bare natural lips ("mặt mộc / không son").
 */
export function resolveComparePairMeta(mode: ComparePairMode): ComparePairMeta {
  if (mode === "bare_vs_a") {
    return {
      leftKind: "bare",
      rightKind: "A",
      hintText: "Kéo so mộc · Màu A",
      ariaLabel: "Thanh trượt so sánh mặt mộc không son và Màu A",
    };
  }
  if (mode === "bare_vs_b") {
    return {
      leftKind: "bare",
      rightKind: "B",
      hintText: "Kéo so mộc · Màu B",
      ariaLabel: "Thanh trượt so sánh mặt mộc không son và Màu B",
    };
  }
  return {
    leftKind: "A",
    rightKind: "B",
    hintText: "Kéo so sánh A · B",
    ariaLabel: "Thanh trượt so sánh Màu A và Màu B trực tiếp trên môi",
  };
}

export interface ResolveCompareSelectionInput {
  slot: CompareSlot;
  pickedId: number;
  currentAId: number | null;
  currentBId: number | null;
}

export interface ResolveCompareSelectionResult {
  nextAId: number | null;
  nextBId: number | null;
  nextActiveSlot: CompareSlot;
  swapped: boolean;
}

/**
 * Pure slot-assignment logic for "Chọn so sánh" (2-shade lipstick comparison).
 * Guarantees slot A and slot B stay distinct when picking from the catalog:
 * tapping the shade already held by the opposite slot swaps A <-> B cleanly.
 */
export function resolveCompareSlotSelection(
  input: ResolveCompareSelectionInput
): ResolveCompareSelectionResult {
  const { slot, pickedId, currentAId, currentBId } = input;

  if (slot === "A") {
    if (currentBId !== null && pickedId === currentBId) {
      return {
        nextAId: currentBId,
        nextBId: currentAId,
        nextActiveSlot: "A",
        swapped: true,
      };
    }
    return {
      nextAId: pickedId,
      nextBId: currentBId,
      nextActiveSlot: "B",
      swapped: false,
    };
  }

  if (currentAId !== null && pickedId === currentAId) {
    return {
      nextAId: currentBId,
      nextBId: currentAId,
      nextActiveSlot: "B",
      swapped: true,
    };
  }

  return {
    nextAId: currentAId,
    nextBId: pickedId,
    nextActiveSlot: "B",
    swapped: false,
  };
}

export interface CompareDecisionInput {
  productA: MatchedProduct;
  productB: MatchedProduct;
  matchPercentA: number;
  matchPercentB: number;
  priceA: ProductPriceEstimate | null;
  priceB: ProductPriceEstimate | null;
  traitsA: VnStudentTraits | null;
  traitsB: VnStudentTraits | null;
}

export interface CompareDecisionSummary {
  headlineVi: string;
  sublineVi: string;
  recommendedSlot: CompareSlot | "tie";
}

function averagePriceK(price: ProductPriceEstimate | null): number {
  if (!price) return 0;
  return (price.minK + price.maxK) / 2;
}

/**
 * Produces a concise, plain-Vietnamese shopping verdict comparing Shade A vs Shade B
 * using tone match, student price tier, and bare-face wearability (no hex codes or jargon).
 */
export function buildCompareBuyingVerdict(
  input: CompareDecisionInput
): CompareDecisionSummary {
  const {
    productA,
    productB,
    matchPercentA,
    matchPercentB,
    priceA,
    priceB,
    traitsA,
    traitsB,
  } = input;

  const maxMatch = Math.max(matchPercentA, matchPercentB);
  const diff = matchPercentA - matchPercentB;
  const priceDiffK = averagePriceK(priceA) - averagePriceK(priceB);

  // Brutal honesty: never flatter two poor shades as "cả hai đều rất hợp"
  if (maxMatch < 62) {
    return {
      headlineVi: "Nói thẳng: cả 2 màu này đều dễ dìm tông da của bạn",
      sublineVi: `Cả Màu A (${matchPercentA}%) lẫn Màu B (${matchPercentB}%) đều lệch sắc da thật — nên đổi sang 4 màu đầu danh sách để tránh phí tiền.`,
      recommendedSlot: "tie",
    };
  }

  if (Math.abs(diff) >= 3) {
    const winnerSlot: CompareSlot = diff > 0 ? "A" : "B";
    const winnerProd = winnerSlot === "A" ? productA : productB;
    const winnerMatch = winnerSlot === "A" ? matchPercentA : matchPercentB;
    const loserMatch = winnerSlot === "A" ? matchPercentB : matchPercentA;
    const winnerTraits = winnerSlot === "A" ? traitsA : traitsB;
    const winnerCheaper = winnerSlot === "A" ? priceDiffK < -20 : priceDiffK > 20;

    const reasons: string[] = [`hợp tông da hơn (+${winnerMatch - loserMatch}%)`];
    if (winnerCheaper) reasons.push("giá mềm hơn");
    if (winnerTraits?.bareFaceFriendly) reasons.push("dễ dùng mặt mộc đi học");

    return {
      headlineVi:
        winnerMatch < 72
          ? `Màu ${winnerSlot} (${winnerProd.shade}) đỡ lệch hơn, nhưng vẫn chưa tối ưu`
          : `Nên chốt Màu ${winnerSlot} (${winnerProd.shade})`,
      sublineVi: `Ưu thế: ${reasons.join(" · ")}.`,
      recommendedSlot: winnerSlot,
    };
  }

  if (Math.abs(priceDiffK) >= 40) {
    const cheaperSlot: CompareSlot = priceDiffK < 0 ? "A" : "B";
    const cheaperProd = cheaperSlot === "A" ? productA : productB;
    return {
      headlineVi: `Cả hai đều hợp da — Màu ${cheaperSlot} (${cheaperProd.shade}) tiết kiệm hơn`,
      sublineVi:
        "Độ hài hòa gần như tương đương, bạn có thể chọn theo ngân sách hoặc chất son thích hơn.",
      recommendedSlot: cheaperSlot,
    };
  }

  return {
    headlineVi: "Cả hai màu đều rất hợp tông da của bạn",
    sublineVi: "Kéo thanh trượt trên môi để chọn sắc độ bạn thấy tươi gương mặt nhất.",
    recommendedSlot: "tie",
  };
}
