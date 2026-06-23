const THRESHOLD = 5500;

const SHIPPING_RATES = {
  honshu: { normal: 910, cool: 1160 },
  chushikoku_kyushu_hokkaido: { normal: 1170, cool: 1420 },
  okinawa: { normal: 1800, cool: 2000 },
};

const PREFECTURE_TO_REGION = {
  // 本州
  "青森県": "honshu", "岩手県": "honshu", "宮城県": "honshu",
  "秋田県": "honshu", "山形県": "honshu", "福島県": "honshu",
  "茨城県": "honshu", "栃木県": "honshu", "群馬県": "honshu",
  "埼玉県": "honshu", "千葉県": "honshu", "東京都": "honshu",
  "神奈川県": "honshu", "新潟県": "honshu", "富山県": "honshu",
  "石川県": "honshu", "福井県": "honshu", "山梨県": "honshu",
  "長野県": "honshu", "岐阜県": "honshu", "静岡県": "honshu",
  "愛知県": "honshu", "三重県": "honshu", "滋賀県": "honshu",
  "京都府": "honshu", "大阪府": "honshu", "兵庫県": "honshu",
  "奈良県": "honshu", "和歌山県": "honshu", "鳥取県": "honshu",
  "島根県": "honshu",
  // 中四国・九州・北海道
  "北海道": "chushikoku_kyushu_hokkaido",
  "山口県": "chushikoku_kyushu_hokkaido",
  "岡山県": "chushikoku_kyushu_hokkaido", "広島県": "chushikoku_kyushu_hokkaido",
  "徳島県": "chushikoku_kyushu_hokkaido", "香川県": "chushikoku_kyushu_hokkaido",
  "愛媛県": "chushikoku_kyushu_hokkaido", "高知県": "chushikoku_kyushu_hokkaido",
  "福岡県": "chushikoku_kyushu_hokkaido", "佐賀県": "chushikoku_kyushu_hokkaido",
  "長崎県": "chushikoku_kyushu_hokkaido", "熊本県": "chushikoku_kyushu_hokkaido",
  "大分県": "chushikoku_kyushu_hokkaido", "宮崎県": "chushikoku_kyushu_hokkaido",
  "鹿児島県": "chushikoku_kyushu_hokkaido",
  // 沖縄
  "沖縄県": "okinawa",
};

function getShippingCost(option, region) {
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

function getVisibleOption(params) {
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

function calculateDestinationShipping(items, region) {
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
      case "jouon":     hasJouon = true; break;
      case "reizo":     hasReizo = true; reizoTotal += item.totalPrice; break;
      case "reito":     hasReito = true; reitoTotal += item.totalPrice; break;
      case "osuimono":  hasOsuiMono = true; break;
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
 * Map a Japanese prefecture name to its shipping region key.
 * @param {string} prefecture e.g. "東京都"
 * @returns {string|null} region key, or null if unknown
 */
function getRegionFromPrefecture(prefecture) {
  return PREFECTURE_TO_REGION[prefecture] || null;
}

module.exports = {
  PREFECTURE_TO_REGION,
  SHIPPING_RATES,
  calculateDestinationShipping,
  getRegionFromPrefecture,
};
