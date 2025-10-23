import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const app = new Hono();

app.use("*", logger(console.log));

app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.get("/make-server-484a241a/health", (c) => c.json({ status: "ok" }));

function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizeRole(role: unknown) {
  if (typeof role !== "string") return null;
  return role
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

async function requireAdmin(
  supabaseAdmin: SupabaseClient,
  accessToken: string,
  actionDescription: string,
) {
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError) {
    console.error("Failed to resolve user from access token", userError);
    return { status: 401, body: { error: "Invalid authorization token" } } as const;
  }

  const user = userData?.user;

  if (!user) {
    return { status: 401, body: { error: "Invalid authorization token" } } as const;
  }

  const userId = user.id;
  const normalizedMetadataRole = normalizeRole(
    user.app_metadata?.role ??
      (Array.isArray(user.app_metadata?.roles) ? user.app_metadata?.roles[0] : undefined) ??
      user.user_metadata?.role,
  );

  if (normalizedMetadataRole === "ADMIN") {
    return { userId } as const;
  }

  const {
    data: perfil,
    error: perfilError,
  } = await supabaseAdmin
    .from("perfiles")
    .select("rol")
    .eq("user_id", userId)
    .maybeSingle();

  if (perfilError) {
    console.error("Error verifying perfil:", perfilError);
    return { status: 500, body: { error: "Failed to verify user profile" } } as const;
  }

  if (!perfil) {
    console.warn(
      `User ${user.email ?? userId} attempted to ${actionDescription} but no perfil row was found.`,
    );
    return {
      status: 403,
      body: { error: `Administrator profile not found for user ${user.email ?? userId}` },
    } as const;
  }

  const normalizedPerfilRole = normalizeRole(perfil.rol);

  if (normalizedPerfilRole !== "ADMIN") {
    console.warn(
      `User ${user.email ?? userId} attempted to ${actionDescription} with role "${perfil.rol}".`,
    );
    return {
      status: 403,
      body: { error: `Only administrators can ${actionDescription}` },
    } as const;
  }

  if (normalizedMetadataRole !== "ADMIN") {
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...user.app_metadata,
          role: "ADMIN",
        },
      });
    } catch (syncError) {
      console.warn(
        `Failed to sync admin role to app_metadata for ${user.email ?? userId}:`,
        syncError,
      );
    }
  }

  return { userId } as const;
}

function extractAccessToken(header?: string) {
  const token = header?.split(" ")[1];
  return token && token.length > 0 ? token : null;
}

app.post("/make-server-484a241a/create-user", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "create users");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { email, password, nombre, rol } = body ?? {};

    if (!email || !password || !nombre || !rol) {
      return c.json(
        { error: "Missing required fields: email, password, nombre, rol" },
        400,
      );
    }

    if (!["ADMIN", "OPERADOR"].includes(rol)) {
      return c.json({ error: "Invalid role. Must be ADMIN or OPERADOR" }, 400);
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
      app_metadata: { role: rol },
    });

    if (createError || !newUser?.user) {
      console.error("Error creating user:", createError);
      return c.json({ error: createError?.message ?? "Failed to create user" }, 400);
    }

    const { error: perfilCreateError } = await supabaseAdmin
      .from("perfiles")
      .insert([
        {
          user_id: newUser.user.id,
          nombre,
          rol,
        },
      ]);

    if (perfilCreateError) {
      console.error("Error creating perfil:", perfilCreateError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return c.json({ error: "Failed to create user profile" }, 500);
    }

    return c.json({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        nombre,
        rol,
      },
    });
  } catch (error) {
    console.error("Error in create-user endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
});

app.post("/make-server-484a241a/update-user-email", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "update user emails");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId, newEmail } = body ?? {};

    if (!userId || !newEmail) {
      return c.json({ error: "Missing required fields: userId, newEmail" }, 400);
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail },
    );

    if (updateError || !updatedUser?.user) {
      console.error("Error updating user email:", updateError);
      return c.json({ error: updateError?.message ?? "Failed to update user email" }, 400);
    }

    return c.json({
      success: true,
      user: {
        id: updatedUser.user.id,
        email: updatedUser.user.email,
      },
    });
  } catch (error) {
    console.error("Error in update-user-email endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
});

app.post("/make-server-484a241a/get-user-email", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "view user emails");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId } = body ?? {};

    if (!userId) {
      return c.json({ error: "Missing required field: userId" }, 400);
    }

    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError || !userData?.user) {
      console.error("Error getting user:", getUserError);
      return c.json({ error: getUserError?.message ?? "Failed to get user" }, 400);
    }

    return c.json({
      success: true,
      email: userData.user.email,
    });
  } catch (error) {
    console.error("Error in get-user-email endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
});

app.post("/make-server-484a241a/delete-user", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "delete users");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId } = body ?? {};

    if (!userId) {
      return c.json({ error: "Missing required field: userId" }, 400);
    }

    const { error: deletePerfilError } = await supabaseAdmin
      .from("perfiles")
      .delete()
      .eq("user_id", userId);

    if (deletePerfilError) {
      console.error("Error deleting perfil:", deletePerfilError);
      return c.json({ error: deletePerfilError.message }, 400);
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error("Error deleting user:", deleteUserError);
      return c.json({ error: deleteUserError.message }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error in delete-user endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
});

Deno.serve(app.fetch);
