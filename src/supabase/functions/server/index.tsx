const supabase = createClient(supabaseUrl, supabaseAnonKey);
import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
const app = new Hono();

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
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

// Health check endpoint
app.get("/make-server-484a241a/health", (c) => {
  return c.json({ status: "ok" });
});

// Create user endpoint (ADMIN only)
app.post("/make-server-484a241a/create-user", async (c) => {
  try {
    // Get access token from Authorization header
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    // Create Supabase client with anon key to verify user
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return c.json({ error: "Server configuration error" }, 500);
    }

    // Verify the requesting user is an ADMIN
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(" ")[1];
    if (!accessToken) return c.json({ error: "No authorization token provided" }, 401);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return c.json({ error: "Invalid authorization token" }, 401);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return c.json({ error: "Invalid authorization token" }, 401);
    }

    // Check if user is ADMIN
    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    if (perfilError || !perfil || perfil.rol !== 'ADMIN') {
      return c.json({ error: "Only administrators can create users" }, 403);
    }

    // Get user data from request body
    const body = await c.req.json();
    const { email, password, nombre, rol } = body;

    if (!email || !password || !nombre || !rol) {
      return c.json({ error: "Missing required fields: email, password, nombre, rol" }, 400);
    }

    if (!['ADMIN', 'OPERADOR'].includes(rol)) {
      return c.json({ error: "Invalid role. Must be ADMIN or OPERADOR" }, 400);
    }

    // Create user with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since we don't have email server configured
      user_metadata: { nombre }
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return c.json({ error: createError.message }, 400);
    }

    // Create perfil for the new user
    const { error: perfilCreateError } = await supabaseAdmin
      .from('perfiles')
      .insert([{
        user_id: newUser.user.id,
        nombre,
        rol
      }]);

    if (perfilCreateError) {
      console.error('Error creating perfil:', perfilCreateError);
      // Try to delete the auth user since perfil creation failed
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return c.json({ error: "Failed to create user profile" }, 500);
    }

    return c.json({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        nombre,
        rol
      }
    });

  } catch (error) {
    console.error('Error in create-user endpoint:', error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// Update user email endpoint (ADMIN only)
app.post("/make-server-484a241a/update-user-email", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return c.json({ error: "Server configuration error" }, 500);
    }

    // Verify the requesting user is an ADMIN
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(" ")[1];
    if (!accessToken) return c.json({ error: "No authorization token provided" }, 401);

    // Cliente autenticado como el usuario que llama (RLS lo reconocerá como "authenticated")
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // (opcional, si querés seguir usando getUser)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return c.json({ error: "Invalid authorization token" }, 401);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return c.json({ error: "Invalid authorization token" }, 401);
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    if (perfilError || !perfil || perfil.rol !== 'ADMIN') {
      return c.json({ error: "Only administrators can update user emails" }, 403);
    }

    const body = await c.req.json();
    const { userId, newEmail } = body;

    if (!userId || !newEmail) {
      return c.json({ error: "Missing required fields: userId, newEmail" }, 400);
    }

    // Update email with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail }
    );

    if (updateError) {
      console.error('Error updating user email:', updateError);
      return c.json({ error: updateError.message }, 400);
    }

    return c.json({
      success: true,
      user: {
        id: updatedUser.user.id,
        email: updatedUser.user.email
      }
    });

  } catch (error) {
    console.error('Error in update-user-email endpoint:', error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// Get user email endpoint (ADMIN only)
app.post("/make-server-484a241a/get-user-email", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return c.json({ error: "Server configuration error" }, 500);
    }

    // Verify the requesting user is an ADMIN
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(" ")[1];
    if (!accessToken) return c.json({ error: "No authorization token provided" }, 401);

    // Cliente autenticado como el usuario que llama (RLS lo reconocerá como "authenticated")
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // (opcional, si querés seguir usando getUser)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return c.json({ error: "Invalid authorization token" }, 401);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return c.json({ error: "Invalid authorization token" }, 401);
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    if (perfilError || !perfil || perfil.rol !== 'ADMIN') {
      return c.json({ error: "Only administrators can view user emails" }, 403);
    }

    const body = await c.req.json();
    const { userId } = body;

    if (!userId) {
      return c.json({ error: "Missing required field: userId" }, 400);
    }

    // Get user email with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError) {
      console.error('Error getting user:', getUserError);
      return c.json({ error: getUserError.message }, 400);
    }

    return c.json({
      success: true,
      email: userData.user.email
    });

  } catch (error) {
    console.error('Error in get-user-email endpoint:', error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

// Delete user endpoint (ADMIN only)
app.post("/make-server-484a241a/delete-user", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(' ')[1];

    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return c.json({ error: "Server configuration error" }, 500);
    }

    // Verify the requesting user is an ADMIN
    const authHeader = c.req.header("Authorization");
    const accessToken = authHeader?.split(" ")[1];
    if (!accessToken) return c.json({ error: "No authorization token provided" }, 401);

    // Cliente autenticado como el usuario que llama (RLS lo reconocerá como "authenticated")
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // (opcional, si querés seguir usando getUser)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return c.json({ error: "Invalid authorization token" }, 401);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return c.json({ error: "Invalid authorization token" }, 401);
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('rol')
      .eq('user_id', user.id)
      .single();

    if (perfilError || !perfil || perfil.rol !== 'ADMIN') {
      return c.json({ error: "Only administrators can delete users" }, 403);
    }

    const body = await c.req.json();
    const { userId } = body;

    if (!userId) {
      return c.json({ error: "Missing required field: userId" }, 400);
    }

    // Delete user with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // First delete perfil
    const { error: deletePerfilError } = await supabaseAdmin
      .from('perfiles')
      .delete()
      .eq('user_id', userId);

    if (deletePerfilError) {
      console.error('Error deleting perfil:', deletePerfilError);
      return c.json({ error: deletePerfilError.message }, 400);
    }

    // Then delete auth user
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('Error deleting user:', deleteUserError);
      return c.json({ error: deleteUserError.message }, 400);
    }

    return c.json({ success: true });

  } catch (error) {
    console.error('Error in delete-user endpoint:', error);
    return c.json({ error: error.message || "Internal server error" }, 500);
  }
});

Deno.serve(app.fetch);