let cachedToken = null;
let tokenExpiry = null;

export async function getUserToken() {
  const now = Date.now();

  // if (cachedToken && tokenExpiry && now < tokenExpiry - 60000) { // 1 minute buffer
  //   console.log("Using cached public token:", cachedToken);
  //   return cachedToken;
  // }

  try {
    console.log("Fetching new public token...");
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_ENDPOINT}user/publicToken`);
    if (!res.ok) throw new Error("Failed to fetch token");

    const data = await res.json();
    const token = data.token;

    // extract expiry
    const [, payload] = token.split(".");
    const decoded = JSON.parse(atob(payload));
    const exp = decoded.exp * 1000; // convert to ms

    // cache it
    cachedToken = token;
    tokenExpiry = exp;

    console.log("Fetched and cached new token:", token);
    return token;
  } catch (err) {
    console.error("Error fetching public token:", err);
    return null;
  }
}
