let cachedToken = null;
let tokenExpiry = null;

export async function getUserToken() {
  const now = Date.now();

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_ENDPOINT}user/publicToken`
    );
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

    return token;
  } catch (err) {
    console.error("Error fetching public token:", err);
    return null;
  }
}
