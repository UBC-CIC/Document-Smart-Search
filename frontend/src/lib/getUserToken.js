// getUserToken.js

let cachedToken = null;
let tokenExpiry = null;

export async function getUserToken() {
  const now = Date.now();

  // Return cached token if still valid
  if (cachedToken && tokenExpiry && now < tokenExpiry) {
    return cachedToken;
  }

  try {
    console.log("Fetching new public token...");
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/publicToken`);
    if (!res.ok) throw new Error("Failed to fetch token");

    const data = await res.json();
    const token = data.token;

    // Decode the token to extract expiry
    const [, payload] = token.split(".");
    const decoded = JSON.parse(atob(payload));
    const exp = decoded.exp * 1000; // convert to ms

    // Cache it
    cachedToken = token;
    tokenExpiry = exp;

    console.log("Fetched and cached new token:", token);
    return token;
  } catch (err) {
    console.error("Error fetching public token:", err);
    return null;
  }
}
