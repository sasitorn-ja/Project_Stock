type NominatimReverseResponse = {
  name?: string;
  display_name?: string;
  address?: {
    amenity?: string;
    road?: string;
    neighbourhood?: string;
    quarter?: string;
    suburb?: string;
    city?: string;
    province?: string;
    state?: string;
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
  const accuracyText = typeof input.accuracy === "number" ? ` / accuracy ${Math.round(input.accuracy)} m` : "";
  const coordinateText = `${input.latitude.toFixed(6)},${input.longitude.toFixed(6)}${accuracyText}`;

  return input.locationText ? `${coordinateText}\n${input.locationText}` : coordinateText;
}

function formatNearbyLocation(data: NominatimReverseResponse) {
  const address = data.address ?? {};
  const nearby = [
    address.amenity || data.name,
    address.road,
    address.neighbourhood,
  ].filter(Boolean);

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

    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        "User-Agent": "ProjectStockJobTransport/1.0",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as NominatimReverseResponse;
    const address = data.address ?? {};
    const district = address.suburb || "";
    const province = address.city || address.province || address.state || "";
    const nearby = formatNearbyLocation(data);

    return [
      address.quarter ? `แขวง: ${address.quarter.replace(/^แขวง/, "")}` : "",
      district ? `เขต/อำเภอ: ${district.replace(/^เขต/, "")}` : "",
      province ? `จังหวัด: ${province}` : "",
      nearby ? `ใกล้/อยู่บริเวณ: ${nearby}` : "",
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}
