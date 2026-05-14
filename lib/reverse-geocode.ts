// Nominatim field mapping for Thailand:
//
// Bangkok:
//   quarter        → แขวง (sub-district)
//   suburb         → เขต  (district)
//   city           → กรุงเทพมหานคร
//
// Other provinces:
//   quarter / suburb / neighbourhood  → ตำบล (sub-district)
//   county / city_district            → อำเภอ (district)  ← most common field for amphoe
//   state / province                  → จังหวัด

type NominatimReverseResponse = {
  name?: string;
  display_name?: string;
  address?: {
    amenity?: string;
    building?: string;
    road?: string;
    neighbourhood?: string;
    quarter?: string;        // แขวง (Bangkok) / sometimes ตำบล elsewhere
    suburb?: string;         // เขต (Bangkok) / ตำบล (provinces)
    city_district?: string;  // อำเภอ (some provincial cities)
    county?: string;         // อำเภอ (provinces) — the key missing field
    city?: string;           // กรุงเทพมหานคร or large cities
    province?: string;       // จังหวัด
    state?: string;          // จังหวัด (fallback)
    postcode?: string;
    country?: string;
  };
};

export function formatGpsText(input: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  locationText?: string;
}) {
  const accuracyText =
    typeof input.accuracy === "number" ? ` / accuracy ${Math.round(input.accuracy)} m` : "";
  const coordinateText = `${input.latitude.toFixed(6)},${input.longitude.toFixed(6)}${accuracyText}`;

  return input.locationText ? `${coordinateText}\n${input.locationText}` : coordinateText;
}

function stripPrefix(value: string, ...prefixes: string[]) {
  let result = value.trim();
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length).trim();
    }
  }
  return result;
}

function formatNearbyLocation(data: NominatimReverseResponse) {
  const address = data.address ?? {};
  const nearby = [address.amenity || data.name, address.road, address.neighbourhood].filter(Boolean);

  if (nearby.length) {
    return nearby.join(" / ");
  }

  return data.display_name?.split(",").slice(0, 2).join(" / ").trim() || "";
}

export async function reverseGeocodeThaiLocation(input: {
  latitude: number;
  longitude: number;
}) {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(input.latitude),
      lon: String(input.longitude),
      zoom: "18",
      addressdetails: "1",
      "accept-language": "th",
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      {
        headers: {
          "User-Agent": "ProjectStockJobTransport/1.0",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as NominatimReverseResponse;
    const address = data.address ?? {};

    // Detect Bangkok vs other provinces
    const cityName = address.city ?? "";
    const stateName = address.state ?? address.province ?? "";
    const isBangkok =
      cityName.includes("กรุงเทพ") ||
      stateName.includes("กรุงเทพ") ||
      cityName.toLowerCase().includes("bangkok");

    let tambon = ""; // ตำบล / แขวง
    let amphoe = ""; // อำเภอ / เขต
    let changwat = ""; // จังหวัด

    if (isBangkok) {
      // Bangkok address hierarchy
      tambon = address.quarter ?? "";
      amphoe = address.suburb ?? "";
      changwat = cityName || "กรุงเทพมหานคร";
    } else {
      // Provincial address hierarchy
      // ตำบล: quarter takes priority, then suburb, then neighbourhood
      tambon = address.quarter ?? address.suburb ?? address.neighbourhood ?? "";
      // อำเภอ: county is the main field for amphoe in Nominatim for Thailand
      amphoe = address.county ?? address.city_district ?? "";
      // จังหวัด: state is most reliable, then province, then city
      changwat = stateName || cityName;
    }

    const nearby = formatNearbyLocation(data);

    return [
      tambon
        ? `${isBangkok ? "แขวง" : "ตำบล"}: ${stripPrefix(tambon, "แขวง", "ตำบล")}`
        : "",
      amphoe
        ? `${isBangkok ? "เขต" : "อำเภอ"}: ${stripPrefix(amphoe, "เขต", "อำเภอ")}`
        : "",
      changwat ? `จังหวัด: ${stripPrefix(changwat, "จังหวัด")}` : "",
      nearby ? `ใกล้: ${nearby}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
}
