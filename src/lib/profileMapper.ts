// Shared mapper and types for "see someone profile" response

export type ApiDiscipline = { id: number; name: string };

export type ApiSomeoneResponse = {
    user?: {
        userId?: number;
        email?: string;
        fullName?: string;
        fullname?: string;
        roles?: string[] | string;
        enabled?: boolean;
        bio?: string;
    };
    worker?: {
        unitName?: string;
        degreeTitle?: string;
        disciplines?: ApiDiscipline[] | any[];
    } | null;
    admin?: {
        unitName?: string;
    } | null;
    roles?: string[] | string;
    enabled?: boolean;
    // other fields may exist — we ignore them
};

export type ProfileDetail = {
    userId: number;
    email?: string;
    fullName?: string;
    bio?: string;
    workerUnit?: string;
    workerDegree?: string;
    adminUnit?: string;
    disciplines?: ApiDiscipline[];
    roles?: string[];
    enabled?: boolean;
};

/**
 * Safely map backend response (ApiSomeoneResponse) to ProfileDetail used in UI.
 * Works with multiple possible backend shapes (user.* or top-level fields).
 */
export function mapSomeoneToProfileDetail(data: ApiSomeoneResponse | null | undefined, fallbackUserId?: number): ProfileDetail {
    const userObj = data?.user ?? null;

    const userId =
        (userObj && (userObj.userId ?? (userObj as any).id)) ??
        (data as any).userId ??
        fallbackUserId ??
        0;

    const email = userObj?.email ?? (data as any).email;
    const fullName = userObj?.fullName ?? userObj?.fullname ?? (data as any).fullName ?? (data as any).fullname;
    const bio = userObj?.bio ?? '';

    const workerUnit = data?.worker?.unitName ?? '';
    const workerDegree = data?.worker?.degreeTitle ?? '';
    const adminUnit = data?.admin?.unitName ?? '';

    const rawDisciplines = (data?.worker?.disciplines ?? []) as any[];
    const disciplines = Array.isArray(rawDisciplines)
        ? rawDisciplines.map(d => ({ id: d.id, name: d.name }))
        : [];

    // roles can be on different places
    let rolesArr: string[] = [];
    const rolesCandidates = [data?.roles, userObj?.roles, (userObj && (userObj as any).user_roles)];
    for (const rc of rolesCandidates) {
        if (!rc) continue;
        if (Array.isArray(rc)) { rolesArr = rc.map(String); break; }
        if (typeof rc === 'string') { rolesArr = rc.split(',').map(r => r.trim()); break; }
    }

    const enabled = data?.enabled ?? userObj?.enabled ?? true;

    return {
        userId: Number(userId ?? 0),
        email: email,
        fullName: fullName,
        bio,
        workerUnit,
        workerDegree,
        adminUnit,
        disciplines,
        roles: rolesArr,
        enabled,
    };
}