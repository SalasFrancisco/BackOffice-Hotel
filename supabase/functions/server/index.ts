import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
// pdfmake is imported dynamically at runtime only when PDF generation is needed

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
// Also expose the same health route under /server prefix (some invocations
// arrive with the function name included in the path).
app.get("/server/make-server-484a241a/health", (c) => c.json({ status: "ok" }));

// PDF font loading and pdfmake are performed lazily inside the PDF builder

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatTime = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sanitizeFileNamePart = (value: string) =>
  (value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);

const formatDateForFileName = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "sin-fecha";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
};

const buildPresupuestoFileName = (input: {
  nombreBase?: string | null;
  tipoEvento?: string | null;
  fechaInicio: string;
  fallbackEvento?: string | null;
}) => {
  const evento =
    sanitizeFileNamePart(input.nombreBase || "") ||
    sanitizeFileNamePart(input.tipoEvento || "") ||
    sanitizeFileNamePart(input.fallbackEvento || "") ||
    "Evento";
  const fecha = formatDateForFileName(input.fechaInicio);
  return `${evento} - ${fecha}.pdf`;
};

const PUBLIC_RESERVA_NOTIFICATION_ORIGIN = "salones_form";

const LOCAL_LOGO_URL = new URL("./assets/QuintoCente.png", import.meta.url);
let logoDataUrlCache: string | null | undefined = undefined;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const bytesToDataUrl = (bytes: Uint8Array, mimeType = "image/png") => {
  const base64 = bytesToBase64(bytes);
  return `data:${mimeType};base64,${base64}`;
};

const loadLogoDataUrl = async (): Promise<string | null> => {
  if (logoDataUrlCache !== undefined) {
    return logoDataUrlCache;
  }

  try {
    const logoBytes = await Deno.readFile(LOCAL_LOGO_URL);
    const dataUrl = bytesToDataUrl(logoBytes, "image/png");
    logoDataUrlCache = dataUrl;
    return dataUrl;
  } catch (error) {
    console.warn(`No se pudo cargar el logo local (${LOCAL_LOGO_URL.pathname}):`, error);
    logoDataUrlCache = null;
    return null;
  }
};

type PublicServicioPayload = {
  id_servicio: number;
  cantidad: number;
};

type PublicReservaPayload = {
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  tipo_evento?: string | null;
  cantidad: number;
  id_distribucion?: number | null;
  salon_id?: number | null;
  salon_nombre?: string | null;
  observaciones?: string | null;
  servicios?: PublicServicioPayload[] | null;
};

type PresupuestoServicio = {
  servicio: {
    id: number;
    nombre: string;
    descripcion?: string | null;
    precio: number;
  };
  cantidad: number;
};

const buildServiciosBody = (servicios: PresupuestoServicio[]) => {
  const headerRow = [
    { text: "Servicio", style: "tableHeader" },
    { text: "Descripcion", style: "tableHeader" },
    { text: "Cantidad", style: "tableHeader", alignment: "center" },
    { text: "Precio unitario", style: "tableHeader", alignment: "right" },
    { text: "Subtotal", style: "tableHeader", alignment: "right" },
  ];

  if (servicios.length === 0) {
    return [
      headerRow,
      [
        {
          text: "No se agregaron servicios adicionales para esta reserva.",
          colSpan: 5,
          style: "tableCell",
        },
        {},
        {},
        {},
        {},
      ],
    ];
  }

  return [
    headerRow,
    ...servicios.map(({ servicio, cantidad }) => {
      const unit = Number(servicio.precio) || 0;
      const subtotal = unit * cantidad;

      return [
        { text: servicio.nombre, style: "tableCell" },
        { text: servicio.descripcion || "Sin descripcion", style: "tableCell" },
        { text: String(cantidad), style: "tableCell", alignment: "center" },
        { text: formatCurrency(unit), style: "tableCell", alignment: "right" },
        { text: formatCurrency(subtotal), style: "tableCell", alignment: "right" },
      ];
    }),
  ];
};

const buildPresupuestoPdf = async (
  input: {
    reservaId: number;
    salon: { nombre: string; descripcion?: string | null; precio_base: number; capacidad: number };
    distribucion?: { nombre: string; capacidad: number } | null;
    cliente: { nombre: string; email?: string | null; telefono?: string | null };
    fechaInicio: string;
    fechaFin: string;
    tipoEvento?: string | null;
    cantidadPersonas: number;
    servicios: PresupuestoServicio[];
  },
) => {
  // Import pdfmake and its fonts lazily so the function can boot when PDF generation
  // is not required (e.g. public-catalog). If import fails, surface a clear error.
  let pdfMake: any;
  let pdfFonts: any;
  // Prefer a vendored copy (bundled with the function) to avoid relying on
  // npm resolution in the edge runtime. If not present, fall back to the
  // npm: specifier (for local testing or environments that resolve npm:).
  try {
    try {
      const localMod = await import('./vendor/pdfmake/build/pdfmake.js');
      const localFonts = await import('./vendor/pdfmake/build/vfs_fonts.js');
      pdfMake = (localMod && (localMod as any).default) || localMod;
      pdfFonts = (localFonts && (localFonts as any).default) || localFonts;
    } catch (localErr) {
      // Local vendor not available; attempt to load from npm specifier.
      try {
        const mod = await import('npm:pdfmake@0.2.20/build/pdfmake.js');
        const fonts = await import('npm:pdfmake@0.2.20/build/vfs_fonts.js');
        pdfMake = (mod && (mod as any).default) || mod;
        pdfFonts = (fonts && (fonts as any).default) || fonts;
      } catch (err) {
        const details = (localErr && localErr.message) ? ` (local: ${localErr.message})` : '';
        throw new Error('PDF generation is not available in this environment: ' + (err?.message || err) + details);
      }
    }
  } catch (err) {
    throw err;
  }

  // Ensure fonts are loaded into pdfMake
  const fontsSource =
    (pdfFonts as any)?.pdfMake?.vfs ||
    (pdfFonts as any)?.default?.pdfMake?.vfs ||
    (pdfFonts as any)?.default ||
    (pdfFonts as any);

  if (!fontsSource) {
    throw new Error('No se pudieron cargar las fuentes para generar el PDF.');
  }

  (pdfMake as any).vfs = fontsSource;

  const capacidadMaxima =
    input.distribucion?.capacidad && input.distribucion.capacidad > 0
      ? input.distribucion.capacidad
      : input.salon.capacidad;

  const totalServicios = input.servicios.reduce((acc, { servicio, cantidad }) => {
    const unit = Number(servicio.precio) || 0;
    return acc + unit * cantidad;
  }, 0);

  const totalGeneral = input.salon.precio_base + totalServicios;
  const logoDataUrl = await loadLogoDataUrl();

  const headerContent = logoDataUrl
    ? [
        { image: logoDataUrl, fit: [190, 80], alignment: "center", margin: [0, 0, 0, 8] },
        { text: "Presupuesto de Evento", style: "header", alignment: "center" },
        { text: `Reserva #${input.reservaId}`, style: "subheader", alignment: "center", margin: [0, 4, 0, 20] },
      ]
    : [
        { text: "Presupuesto de Evento", style: "header", alignment: "center" },
        { text: `Reserva #${input.reservaId}`, style: "subheader", alignment: "center", margin: [0, 0, 0, 20] },
      ];

  const docDefinition = {
    pageMargins: [40, 50, 40, 60],
    content: [
      ...headerContent,
      {
        columns: [
          [
            { text: "Informacion del cliente", style: "sectionTitle" },
            {
              table: {
                widths: ["auto", "*"],
                body: [
                  ["Nombre:", input.cliente.nombre],
                  ["Email:", input.cliente.email || "No informado"],
                  ["Telefono:", input.cliente.telefono || "No informado"],
                  ["Tipo de evento:", input.tipoEvento?.trim() || "Evento"],
                ],
              },
              layout: "noBorders",
            },
          ],
          [
            { text: "Detalles del evento", style: "sectionTitle" },
            {
              table: {
                widths: ["auto", "*"],
                body: [
                  ["Fecha de inicio:", formatDate(input.fechaInicio)],
                  ["Fecha de fin:", formatDate(input.fechaFin)],
                  ["Horario de inicio:", formatTime(input.fechaInicio)],
                  ["Horario de fin:", formatTime(input.fechaFin)],
                  ["Salon:", input.salon.nombre],
                  ["Distribucion:", input.distribucion?.nombre || "Sin distribucion definida"],
                  ["Cantidad de asistentes:", String(input.cantidadPersonas)],
                  ["Capacidad maxima:", String(capacidadMaxima)],
                ],
              },
              layout: "noBorders",
            },
          ],
        ],
        columnGap: 30,
        margin: [0, 0, 0, 25],
      },
      { text: "Salon contratado", style: "sectionTitle" },
      {
        table: {
          widths: ["*", "auto", "auto", "auto"],
          body: [
            [
              { text: "Descripcion", style: "tableHeader" },
              { text: "Cantidad", style: "tableHeader", alignment: "center" },
              { text: "Precio unitario", style: "tableHeader", alignment: "right" },
              { text: "Subtotal", style: "tableHeader", alignment: "right" },
            ],
            [
              {
                text: input.salon.descripcion || "Sin descripcion",
                style: "tableCell",
              },
              { text: "1", style: "tableCell", alignment: "center" },
              { text: formatCurrency(input.salon.precio_base), style: "tableCell", alignment: "right" },
              { text: formatCurrency(input.salon.precio_base), style: "tableCell", alignment: "right" },
            ],
          ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 20],
      },
      { text: "Servicios adicionales solicitados", style: "sectionTitle" },
      {
        table: {
          widths: ["*", "*", "auto", "auto", "auto"],
          body: buildServiciosBody(input.servicios),
        },
        layout: "lightHorizontalLines",
      },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            [
              { text: "Total salon", alignment: "right", style: "totalLabel" },
              { text: formatCurrency(input.salon.precio_base), alignment: "right", style: "totalValue" },
            ],
            [
              { text: "Total servicios", alignment: "right", style: "totalLabel" },
              { text: formatCurrency(totalServicios), alignment: "right", style: "totalValue" },
            ],
            [
              { text: "Total general", alignment: "right", style: "grandTotalLabel" },
              { text: formatCurrency(totalGeneral), alignment: "right", style: "grandTotalValue" },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 20, 0, 0],
      },
    ],
    styles: {
      header: { fontSize: 20, bold: true },
      subheader: { fontSize: 14, color: "#666666" },
      sectionTitle: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] },
      tableHeader: { bold: true, fillColor: "#f5f5f5" },
      tableCell: { fontSize: 10 },
      totalLabel: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
      totalValue: { fontSize: 11, margin: [0, 4, 0, 4] },
      grandTotalLabel: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
      grandTotalValue: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
    },
    defaultStyle: { fontSize: 10 },
  };

  const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      (pdfDoc as any).getBuffer((buffer: ArrayBuffer) => {
        resolve(new Uint8Array(buffer));
      });
    } catch (error) {
      reject(error);
    }
  });

  return pdfBuffer;
};

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

app.post("/make-server-484a241a/reset-user-password", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "reset user passwords");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId, newPassword } = body ?? {};

    if (!userId || !newPassword) {
      return c.json({ error: "Missing required fields: userId, newPassword" }, 400);
    }

    if (String(newPassword).length < 6) {
      return c.json({ error: "Password must be at least 6 characters long" }, 400);
    }

    const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword },
    );

    if (updatePasswordError) {
      console.error("Error resetting user password:", updatePasswordError);
      return c.json({ error: updatePasswordError.message }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error in reset-user-password endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
});

app.post("/make-server-484a241a/get-presupuesto-url", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return c.json({ error: "Invalid authorization token" }, 401);
    }

    const body = await c.req.json();
    const reservaId = Number(body?.reservaId);
    const presupuestoPathFromBody = typeof body?.presupuestoPath === "string" ? body.presupuestoPath.trim() : "";

    let presupuestoPath = presupuestoPathFromBody;

    if (!presupuestoPath) {
      if (!Number.isFinite(reservaId) || reservaId <= 0) {
        return c.json({ error: "Missing required field: reservaId or presupuestoPath" }, 400);
      }

      const { data: reservaData, error: reservaError } = await supabaseAdmin
        .from("reservas")
        .select("presupuesto_url")
        .eq("id", reservaId)
        .single();

      if (reservaError) {
        return c.json({ error: reservaError.message }, 400);
      }

      presupuestoPath = reservaData?.presupuesto_url || "";
    }

    if (!presupuestoPath) {
      return c.json({ error: "La reserva no tiene presupuesto generado" }, 404);
    }

    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from("presupuestos")
      .createSignedUrl(presupuestoPath, 60);

    if (signedError || !signedData?.signedUrl) {
      return c.json({ error: signedError?.message || "No se pudo firmar la URL del presupuesto" }, 500);
    }

    return c.json({ signedUrl: signedData.signedUrl });
  } catch (error) {
    console.error("Error in get-presupuesto-url endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
});

const publicCatalogHandler = async (c) => {
  try {
    const supabaseAdmin = createServiceClient();

    const [{ data: salones, error: salonesError }, { data: distribuciones, error: distError }, { data: categorias, error: catError }, { data: servicios, error: servError }] =
      await Promise.all([
        supabaseAdmin.from("salones").select("*").order("nombre"),
        supabaseAdmin.from("distribuciones").select("*").order("nombre"),
        supabaseAdmin.from("categorias_servicios").select("*").order("nombre"),
        supabaseAdmin.from("servicios").select("*, categoria:categorias_servicios(*)").order("nombre"),
      ]);

    if (salonesError || distError || catError || servError) {
      console.error("Error loading catalog:", salonesError || distError || catError || servError);
      return c.json({ error: "No se pudo cargar el catalogo" }, 500);
    }

    return c.json({
      salones: salones ?? [],
      distribuciones: distribuciones ?? [],
      categorias: categorias ?? [],
      servicios: servicios ?? [],
    });
  } catch (error) {
    console.error("Error in public-catalog endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
};

app.get("/make-server-484a241a/public-catalog", publicCatalogHandler);
app.get("/server/make-server-484a241a/public-catalog", publicCatalogHandler);

const registerPublicReservaNotification = async (
  supabaseAdmin: SupabaseClient,
  input: {
    reservaId: number;
    clienteNombre: string;
    estado: string;
    salonId: number;
  },
) => {
  try {
    const { error: deleteError } = await supabaseAdmin
      .from("notificaciones")
      .delete()
      .eq("reserva_id", input.reservaId)
      .eq("tipo", "RESERVA_NUEVA");

    if (deleteError) {
      console.warn("No se pudo limpiar notificaciones previas de la reserva:", deleteError);
    }

    const { error: insertError } = await supabaseAdmin
      .from("notificaciones")
      .insert([
        {
          tipo: "RESERVA_NUEVA",
          titulo: "Nueva reserva desde Salones",
          mensaje: `Se creo la reserva #${input.reservaId} de ${input.clienteNombre} en estado ${input.estado}.`,
          reserva_id: input.reservaId,
          metadata: {
            cliente_nombre: input.clienteNombre,
            estado: input.estado,
            id_salon: input.salonId,
            origen: PUBLIC_RESERVA_NOTIFICATION_ORIGIN,
            canal: "web_publica",
          },
        },
      ]);

    if (insertError) {
      console.warn("No se pudo registrar notificacion de reserva publica:", insertError);
    }
  } catch (error) {
    console.warn("Error inesperado registrando notificacion de reserva publica:", error);
  }
};

const publicReservaHandler = async (c) => {
  try {
    const body = (await c.req.json()) as PublicReservaPayload;

    const {
      nombre,
      email,
      telefono,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      tipo_evento: tipoEvento,
      cantidad,
      id_distribucion: idDistribucion,
      salon_id: salonId,
      salon_nombre: salonNombre,
      observaciones,
      servicios,
    } = body ?? {};

    if (!nombre || !email || !telefono || !fechaInicio || !fechaFin || !cantidad) {
      return c.json(
        { error: "Missing required fields: nombre, email, telefono, fecha_inicio, fecha_fin, cantidad" },
        400,
      );
    }

    if (!salonId && !salonNombre) {
      return c.json({ error: "Missing required field: salon" }, 400);
    }

    const totalPersonas = Number(cantidad);
    if (!totalPersonas || totalPersonas <= 0) {
      return c.json({ error: "Cantidad de personas invalida" }, 400);
    }

    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    if (Number.isNaN(fechaInicioDate.getTime()) || Number.isNaN(fechaFinDate.getTime())) {
      return c.json({ error: "Formato de fecha invalido" }, 400);
    }

    const now = new Date();
    now.setSeconds(0, 0);
    if (fechaInicioDate < now) {
      return c.json({ error: "La fecha de inicio no puede ser anterior al momento actual" }, 400);
    }

    if (fechaFinDate <= fechaInicioDate) {
      return c.json({ error: "La fecha de fin debe ser posterior a la fecha de inicio" }, 400);
    }

    const supabaseAdmin = createServiceClient();

    let salonQuery = supabaseAdmin.from("salones").select("*").limit(1);
    if (salonId) {
      salonQuery = salonQuery.eq("id", salonId);
    } else if (salonNombre) {
      salonQuery = salonQuery.ilike("nombre", salonNombre);
    }

    const { data: salonData, error: salonError } = await salonQuery.maybeSingle();

    if (salonError) {
      console.error("Error buscando salon:", salonError);
      return c.json({ error: "No se pudo validar el salon seleccionado" }, 500);
    }

    if (!salonData) {
      return c.json({ error: "No se encontro el salon seleccionado" }, 404);
    }

    let distribucionData: { id: number; nombre: string; capacidad: number } | null = null;
    if (idDistribucion) {
      const { data: distData, error: distError } = await supabaseAdmin
        .from("distribuciones")
        .select("id, nombre, capacidad")
        .eq("id", idDistribucion)
        .eq("id_salon", salonData.id)
        .limit(1)
        .maybeSingle();

      if (distError) {
        console.warn("Error buscando distribucion:", distError);
      } else if (distData) {
        distribucionData = distData;
      }
    }

    const exceedsSalonCapacity = totalPersonas > salonData.capacidad;
    const exceedsDistribucionCapacity = Boolean(
      distribucionData && totalPersonas > distribucionData.capacidad,
    );

    if (exceedsSalonCapacity || exceedsDistribucionCapacity) {
      console.warn("Reserva creada con advertencia de capacidad", {
        salonId: salonData.id,
        distribucionId: distribucionData?.id ?? null,
        totalPersonas,
        salonCapacidad: salonData.capacidad,
        distribucionCapacidad: distribucionData?.capacidad ?? null,
        exceedsSalonCapacity,
        exceedsDistribucionCapacity,
      });
    }

    const observacionesParts = [
      tipoEvento ? `Tipo de evento: ${tipoEvento}` : null,
      observaciones ? `Observaciones: ${observaciones}` : null,
    ].filter(Boolean);

    const reservaPayload = {
      cliente_nombre: nombre,
      cliente_email: email,
      cliente_telefono: telefono,
      id_salon: salonData.id,
      id_distribucion: distribucionData?.id ?? null,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado: "Pendiente",
      monto: salonData.precio_base ?? 0,
      cantidad_personas: totalPersonas,
      observaciones: observacionesParts.length > 0 ? observacionesParts.join("\n") : null,
    };

    const { data: reservaData, error: reservaError } = await supabaseAdmin
      .from("reservas")
      .insert([reservaPayload])
      .select()
      .single();

    if (reservaError || !reservaData) {
      console.error("Error creando reserva:", reservaError);
      return c.json({ error: reservaError?.message ?? "No se pudo crear la reserva" }, 500);
    }

    await registerPublicReservaNotification(supabaseAdmin, {
      reservaId: reservaData.id,
      clienteNombre: (nombre || "Sin nombre").trim() || "Sin nombre",
      estado: "Pendiente",
      salonId: salonData.id,
    });

    const selectedServicios = Array.isArray(servicios) ? servicios : [];
    const serviciosIds = selectedServicios
      .map((item) => Number(item?.id_servicio))
      .filter((id) => Number.isFinite(id) && id > 0);

    const serviciosDetalle: PresupuestoServicio[] = [];
    if (serviciosIds.length > 0) {
      const { data: serviciosData, error: serviciosError } = await supabaseAdmin
        .from("servicios")
        .select("id, nombre, descripcion, precio")
        .in("id", serviciosIds);

      if (serviciosError) {
        console.warn("Error cargando servicios:", serviciosError);
      } else {
        const serviciosMap = new Map<number, typeof serviciosData[number]>();
        (serviciosData || []).forEach((item) => serviciosMap.set(item.id, item));
        selectedServicios.forEach((item) => {
          const servicioInfo = serviciosMap.get(Number(item.id_servicio));
          if (!servicioInfo) return;
          const cantidadServicio = Number(item.cantidad) || 1;
          serviciosDetalle.push({
            servicio: servicioInfo,
            cantidad: cantidadServicio,
          });
        });
      }
    }

    if (serviciosDetalle.length > 0) {
      const reservaServiciosPayload = serviciosDetalle.map((item) => ({
        id_reserva: reservaData.id,
        id_servicio: item.servicio.id,
        cantidad: item.cantidad,
      }));

      const { error: reservaServiciosError } = await supabaseAdmin
        .from("reserva_servicios")
        .insert(reservaServiciosPayload);

      if (reservaServiciosError) {
        console.warn("Error guardando servicios de la reserva:", reservaServiciosError);
      }
    }

    let downloadUrl: string | undefined = undefined;
    let pdfError: string | undefined = undefined;
    let pdfGenerated = false;
    let uploaded = false;
    let uploadErrorMsg: string | undefined = undefined;
    let signed = false;
    let signedErrorMsg: string | undefined = undefined;
    const fileName = buildPresupuestoFileName({
      nombreBase: nombre?.trim() || null,
      fechaInicio,
      fallbackEvento: salonData.nombre,
    });
    const storagePath = `reservas/${reservaData.id}/${fileName}`;

    try {
      const pdfBuffer = await buildPresupuestoPdf({
        reservaId: reservaData.id,
        salon: {
          nombre: salonData.nombre,
          descripcion: salonData.descripcion,
          precio_base: Number(salonData.precio_base) || 0,
          capacidad: salonData.capacidad,
        },
        distribucion: distribucionData,
        cliente: {
          nombre: nombre?.trim() || "Reserva sin cliente",
          email,
          telefono,
        },
        fechaInicio,
        fechaFin,
        tipoEvento,
        cantidadPersonas: totalPersonas,
        servicios: serviciosDetalle,
      });

      const { error: uploadError } = await supabaseAdmin.storage
        .from("presupuestos")
        .upload(storagePath, pdfBuffer, {
          cacheControl: "3600",
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        uploadErrorMsg = uploadError?.message || String(uploadError);
        console.error("Error subiendo presupuesto:", uploadErrorMsg);
        // don't fail the whole request; just continue without download URL
      } else {
        uploaded = true;
        await supabaseAdmin
          .from("reservas")
          .update({ presupuesto_url: storagePath })
          .eq("id", reservaData.id);

        const { data: signedData, error: signedError } = await supabaseAdmin.storage
          .from("presupuestos")
          .createSignedUrl(storagePath, 60 * 15);

        if (signedError || !signedData) {
          signedErrorMsg = signedError?.message || String(signedError);
          console.error("Error creando URL firmada:", signedErrorMsg);
        } else {
          signed = true;
          downloadUrl = signedData.signedUrl;
        }
      }

      pdfGenerated = true;
    } catch (err) {
      pdfError = err?.message || String(err);
      console.warn("PDF generation failed or not available:", pdfError);
      // proceed without downloadUrl
    }

    const responseBody: Record<string, unknown> = {
      success: true,
      reservaId: reservaData.id,
      fileName,
      downloadUrl,
      pdfGenerated,
      uploaded,
      signed,
      capacityWarning: exceedsSalonCapacity || exceedsDistribucionCapacity,
      capacityWarningDetail: {
        exceedsSalonCapacity,
        exceedsDistribucionCapacity,
      },
    };

    if (pdfError) responseBody.pdfError = pdfError;
    if (uploadErrorMsg) responseBody.uploadError = uploadErrorMsg;
    if (signedErrorMsg) responseBody.signedError = signedErrorMsg;

    return c.json(responseBody);
  } catch (error) {
    console.error("Error in public-reserva endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
};

app.post("/make-server-484a241a/public-reserva", publicReservaHandler);
app.post("/server/make-server-484a241a/public-reserva", publicReservaHandler);

// Alias de compatibilidad: algunos despliegues exponen rutas sin el
// segmento make-server. Estas rutas se redirigen a los handlers canónicos.
const proxyTo = (path: string) => (c: any) =>
  app.fetch(new Request(new URL(path, c.req.url), c.req.raw));

app.get("/health", proxyTo("/make-server-484a241a/health"));
app.post("/create-user", proxyTo("/make-server-484a241a/create-user"));
app.post("/update-user-email", proxyTo("/make-server-484a241a/update-user-email"));
app.post("/get-user-email", proxyTo("/make-server-484a241a/get-user-email"));
app.post("/delete-user", proxyTo("/make-server-484a241a/delete-user"));
app.post("/reset-user-password", proxyTo("/make-server-484a241a/reset-user-password"));
app.post("/get-presupuesto-url", proxyTo("/make-server-484a241a/get-presupuesto-url"));
app.get("/public-catalog", proxyTo("/make-server-484a241a/public-catalog"));
app.post("/public-reserva", proxyTo("/make-server-484a241a/public-reserva"));

app.get("/server/health", proxyTo("/make-server-484a241a/health"));
app.post("/server/create-user", proxyTo("/make-server-484a241a/create-user"));
app.post("/server/update-user-email", proxyTo("/make-server-484a241a/update-user-email"));
app.post("/server/get-user-email", proxyTo("/make-server-484a241a/get-user-email"));
app.post("/server/delete-user", proxyTo("/make-server-484a241a/delete-user"));
app.post("/server/reset-user-password", proxyTo("/make-server-484a241a/reset-user-password"));
app.post("/server/get-presupuesto-url", proxyTo("/make-server-484a241a/get-presupuesto-url"));
app.get("/server/public-catalog", proxyTo("/make-server-484a241a/public-catalog"));
app.post("/server/public-reserva", proxyTo("/make-server-484a241a/public-reserva"));

Deno.serve(app.fetch);
