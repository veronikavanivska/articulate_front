// lightweight helpers for decoding JWT and handling expiry
export function parseJwt(token: string) {
    try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        return decoded;
    } catch {
        return null;
    }
}

export function getExpiryFromJwt(token: string): number | null {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return null;
    // exp is seconds since epoch
    return payload.exp * 1000;
}