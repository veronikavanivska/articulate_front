// src/lib/errorMapper.ts
type AnyJson = Record<string, any>;

function normalizeMsg(input: string): string {
    const s = (input || '').trim();
    // typowe z gRPC: "ALREADY_EXISTS: Email already exists"
    // chcemy wyjąć część po dwukropku, jeśli wygląda jak "CODE: msg"
    const m = s.match(/^[A-Z_]+:\s*(.+)$/);
    return m?.[1]?.trim() || s;
}

function translateToPolish(raw: string): string {
    const msg = normalizeMsg(raw);

    const dict: Array<[RegExp, string]> = [
        [/email already exists/i, 'Taki adres e-mail już istnieje.'],
        [/email is not right/i, 'Podany adres e-mail jest nieprawidłowy.'],
        [/user does not exist/i, 'Użytkownik nie istnieje.'],
        [/profile not found/i, 'Nie znaleziono profilu użytkownika.'],
        [/role not found/i, 'Nie znaleziono wskazanej roli.'],
        [/role assigned/i, 'Rola została nadana.'],
        [/user already has role/i, 'Użytkownik już ma tę rolę.'],
        [/role removed/i, 'Rola została odebrana.'],
        [/user already has not this role/i, 'Użytkownik nie posiada tej roli.'],
        [/role_user cannot be revoked/i, 'Nie można odebrać roli Użytkownik.'],
        [/password does not match/i, 'Aktualne hasło jest nieprawidłowe.'],
        [/password should be strong/i, 'Hasło jest zbyt słabe.'],
        [/new password must be different/i, 'Nowe hasło musi różnić się od poprzedniego.'],
        [/password changed/i, 'Hasło zostało zmienione.'],
        [/email changed/i, 'Adres e-mail został zmieniony.'],
        [/worker not found/i, 'Nie znaleziono profilu pracownika.'],
        [/discipline not found/i, 'Nie znaleziono dyscypliny.'],
        [/worker is not assigned to discipline/i, 'Pracownik nie jest przypisany do tej dyscypliny.'],
        [/invalid evalyear/i, 'Nieprawidłowy rok ewaluacji.'],
        [/unauthenticated|unauthorized/i, 'Brak autoryzacji. Zaloguj się ponownie.'],
        [/permission denied|forbidden/i, 'Brak uprawnień do wykonania tej operacji.'],
        [/internal server error/i, 'Wystąpił błąd serwera.'],
    ];

    for (const [re, pl] of dict) {
        if (re.test(msg)) return pl;
    }

    // fallback: jeśli wiadomość jest sensowna, pokaż ją (ale po normalizacji)
    if (msg) return msg;

    return 'Wystąpił błąd.';
}

/**
 * Czyta błąd z Response:
 * - najpierw próbuje JSON { message, code }
 * - potem tekst
 * - mapuje na PL
 */
export async function getPolishErrorFromResponse(res: Response): Promise<string> {
    // najpierw spróbuj JSON
    try {
        const text = await res.text().catch(() => '');
        if (!text) {
            // fallback po statusie
            if (res.status === 401) return 'Brak autoryzacji. Zaloguj się ponownie.';
            if (res.status === 403) return 'Brak uprawnień do wykonania tej operacji.';
            if (res.status === 404) return 'Nie znaleziono zasobu.';
            return 'Wystąpił błąd.';
        }

        let json: AnyJson | null = null;
        try {
            json = JSON.parse(text);
        } catch {
            json = null;
        }

        const msgFromJson =
            (json && (json.message || json.error || json.detail)) ? String(json.message || json.error || json.detail) : '';

        const codeFromJson = json?.code ? String(json.code) : '';

        // jeżeli mamy gRPC code i brak message – pokaż code, ale w PL jeśli umiemy
        const rawMsg = msgFromJson || text || codeFromJson || '';

        // jeśli gateway zwróci: {code:"ALREADY_EXISTS", message:"Email already exists"}
        // to i tak mapujemy na PL
        return translateToPolish(rawMsg);
    } catch {
        return 'Wystąpił błąd.';
    }
}

/**
 * Mapowanie "Error.message" (np. z throw new Error(...))
 * – gdy nie mamy już Response.
 */
export function translateErrorMessageToPolish(message: string): string {
    return translateToPolish(message || '');
}