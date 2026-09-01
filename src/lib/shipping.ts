// 送料計算ロジック(純関数)。Express版 lib/shipping.js からの移植。
// 環境変数・外部通信に依存しないため、そのまま Worker でも利用可能。

const THRESHOLD = 5500;

type RegionKey = "honshu" | "chushikoku_kyushu_hokkaido" | "okinawa";

export const SHIPPING_RATES: Record<RegionKey, { normal: number; cool: number }> = {
  honshu: { normal: 910, cool: 1160 },
  chushikoku_kyushu_hokkaido: { normal: 1170, cool: 1420 },
  okinawa: { normal: 1800, cool: 2000 },
};

export const PREFECTURE_TO_REGION: Record<string, RegionKey> = {
  // 本州
  青森県: "honshu", 岩手県: "honshu", 宮城県: "honshu",
  秋田県: "honshu", 山形県: "honshu", 福島県: "honshu",
  茨城県: "honshu", 栃木県: "honshu", 群馬県: "honshu",
  埼玉県: "honshu", 千葉県: "honshu", 東京都: "honshu",
  神奈川県: "honshu", 新潟県: "honshu", 富山県: "honshu",
  石川県: "honshu", 福井県: "honshu", 山梨県: "honshu",
  長野県: "honshu", 岐阜県: "honshu", 静岡県: "honshu",
  愛知県: "honshu", 三重県: "honshu", 滋賀県: "honshu",
  京都府: "honshu", 大阪府: "honshu", 兵庫県: "honshu",
  奈良県: "honshu", 和歌山県: "honshu", 鳥取県: "honshu",
  島根県: "honshu",
  // 中四国・九州・北海道
  北海道: "chushikoku_kyushu_hokkaido",
  山口県: "chushikoku_kyushu_hokkaido",
  岡山県: "chushikoku_kyushu_hokkaido", 広島県: "chushikoku_kyushu_hokkaido",
  徳島県: "chushikoku_kyushu_hokkaido", 香川県: "chushikoku_kyushu_hokkaido",
  愛媛県: "chushikoku_kyushu_hokkaido", 高知県: "chushikoku_kyushu_hokkaido",
  福岡県: "chushikoku_kyushu_hokkaido", 佐賀県: "chushikoku_kyushu_hokkaido",
  長崎県: "chushikoku_kyushu_hokkaido", 熊本県: "chushikoku_kyushu_hokkaido",
  大分県: "chushikoku_kyushu_hokkaido", 宮崎県: "chushikoku_kyushu_hokkaido",
  鹿児島県: "chushikoku_kyushu_hokkaido",
  // 沖縄
  沖縄県: "okinawa",
};

// BigCommerce は注文の state を英語(ローマ字)で保存するため、英語名→地域も用意する。
const ENGLISH_PREFECTURE_TO_REGION: Record<string, RegionKey> = {
  // 本州
  aomori: "honshu", iwate: "honshu", miyagi: "honshu", akita: "honshu",
  yamagata: "honshu", fukushima: "honshu", ibaraki: "honshu", tochigi: "honshu",
  gunma: "honshu", saitama: "honshu", chiba: "honshu", tokyo: "honshu",
  kanagawa: "honshu", niigata: "honshu", toyama: "honshu", ishikawa: "honshu",
  fukui: "honshu", yamanashi: "honshu", nagano: "honshu", gifu: "honshu",
  shizuoka: "honshu", aichi: "honshu", mie: "honshu", shiga: "honshu",
  kyoto: "honshu", osaka: "honshu", hyogo: "honshu", nara: "honshu",
  wakayama: "honshu", tottori: "honshu", shimane: "honshu",
  // 中四国・九州・北海道
  hokkaido: "chushikoku_kyushu_hokkaido", yamaguchi: "chushikoku_kyushu_hokkaido",
  okayama: "chushikoku_kyushu_hokkaido", hiroshima: "chushikoku_kyushu_hokkaido",
  tokushima: "chushikoku_kyushu_hokkaido", kagawa: "chushikoku_kyushu_hokkaido",
  ehime: "chushikoku_kyushu_hokkaido", kochi: "chushikoku_kyushu_hokkaido",
  fukuoka: "chushikoku_kyushu_hokkaido", saga: "chushikoku_kyushu_hokkaido",
  nagasaki: "chushikoku_kyushu_hokkaido", kumamoto: "chushikoku_kyushu_hokkaido",
  oita: "chushikoku_kyushu_hokkaido", miyazaki: "chushikoku_kyushu_hokkaido",
  kagoshima: "chushikoku_kyushu_hokkaido",
  // 沖縄
  okinawa: "okinawa",
};

export type ShippingItem = { shippingType: string | null; totalPrice: number };

function getShippingCost(option: string, region: RegionKey): number {
  const rates = SHIPPING_RATES[region];
  switch (option) {
    case "shipping_free":
    case "shipping_reizo_free":
    case "shipping_reito_free":
      return 0;
    case "shipping_jouon":
      return rates.normal;
    case "shipping_reizo_1160":
    case "shipping_reito_1160":
      return rates.cool;
    case "shipping_reito_jouon":
      return rates.cool + rates.normal;
    case "shipping_reito_jouon_free":
      return rates.normal;
    case "shipping_reizo_1160_reito_1160":
      return rates.cool * 2;
    default:
      return 0;
  }
}

type OptionParams = {
  hasJouon: boolean; hasReizo: boolean; hasReito: boolean; hasOsuiMono: boolean;
  hasFreeReizo: boolean; hasFreeReito: boolean; reizoTotal: number; reitoTotal: number;
};

function getVisibleOption(params: OptionParams): string | null {
  const {
    hasJouon, hasReizo, hasReito, hasOsuiMono,
    hasFreeReizo, hasFreeReito, reizoTotal, reitoTotal,
  } = params;

  const reizoFree = reizoTotal > THRESHOLD;
  const reitoFree = reitoTotal > THRESHOLD;

  if (hasFreeReizo && !hasFreeReito && !hasReito) return "shipping_free";

  if (hasFreeReito && !hasFreeReizo) {
    if (!hasReizo && !hasJouon && !hasOsuiMono && !hasReito) return "shipping_free";
    if (hasReito && !hasReizo && !hasJouon) return "shipping_free";
    if (hasOsuiMono && !hasReizo && !hasJouon && !hasReito) return "shipping_free";
    if (hasJouon && !hasReizo && !hasReito) return "shipping_jouon";
    if (hasReizo && !hasReito) return reizoFree ? "shipping_free" : "shipping_reizo_1160";
    if (hasReito && hasJouon) return "shipping_jouon";
  }

  if (hasFreeReizo && hasReito) return reitoFree ? "shipping_free" : "shipping_reito_1160";

  if (!hasReizo && !hasReito && (hasJouon || hasOsuiMono)) return "shipping_jouon";

  if (hasReizo && !hasReito && !hasJouon) {
    return reizoFree ? "shipping_reizo_free" : "shipping_reizo_1160";
  }

  if (hasReizo && hasJouon && !hasFreeReito && !hasReito) {
    return reizoFree ? "shipping_reizo_free" : "shipping_reizo_1160";
  }

  if (hasReito && !hasReizo && !hasFreeReizo && !hasJouon) {
    return reitoFree ? "shipping_reito_free" : "shipping_reito_1160";
  }

  if (hasReito && hasJouon && !hasReizo && !hasFreeReizo && !hasFreeReito) {
    return reitoFree ? "shipping_reito_jouon_free" : "shipping_reito_jouon";
  }

  if (hasFreeReito && hasJouon && !hasFreeReizo) {
    return reitoFree ? "shipping_reito_jouon_free" : "shipping_reito_jouon";
  }

  if (hasFreeReizo && hasFreeReito && !hasJouon) {
    if (reizoFree && reitoFree) return "shipping_free";
    if (reizoFree) return "shipping_reito_1160";
    if (reitoFree) return "shipping_reizo_1160";
    return "shipping_reizo_1160_reito_1160";
  }

  if (hasReizo && hasReito) {
    if (reizoFree && reitoFree) return "shipping_free";
    if (reizoFree) return "shipping_reito_1160";
    if (reitoFree) return "shipping_reizo_1160";
    return "shipping_reizo_1160_reito_1160";
  }

  return null;
}

export function calculateDestinationShipping(
  items: ShippingItem[],
  region: RegionKey
): number {
  let reizoTotal = 0;
  let reitoTotal = 0;
  let hasJouon = false;
  let hasReizo = false;
  let hasReito = false;
  let hasOsuiMono = false;
  let hasFreeReizo = false;
  let hasFreeReito = false;

  for (const item of items) {
    switch (item.shippingType) {
      case "jouon":      hasJouon = true; break;
      case "reizo":      hasReizo = true; reizoTotal += item.totalPrice; break;
      case "reito":      hasReito = true; reitoTotal += item.totalPrice; break;
      case "osuimono":   hasOsuiMono = true; break;
      case "free_reizo": hasFreeReizo = true; break;
      case "free_reito": hasFreeReito = true; break;
    }
  }

  const option = getVisibleOption({
    hasJouon, hasReizo, hasReito, hasOsuiMono,
    hasFreeReizo, hasFreeReito, reizoTotal, reitoTotal,
  });

  if (!option) return 0;
  return getShippingCost(option, region);
}

/**
 * 都道府県名を送料地域キーに変換。日本語名("東京都")と、BigCommerceが注文に
 * 保存する英語/ローマ字("Tokyo"・大文字小文字問わず)の両方を受け付ける。
 */
export function getRegionFromPrefecture(prefecture: string | null | undefined): RegionKey | null {
  if (!prefecture) return null;
  if (PREFECTURE_TO_REGION[prefecture]) return PREFECTURE_TO_REGION[prefecture];
  return ENGLISH_PREFECTURE_TO_REGION[prefecture.trim().toLowerCase()] || null;
}
