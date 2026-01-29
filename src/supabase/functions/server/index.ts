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

type PublicServicioPayload = {
  id_servicio: number;
  cantidad: number;
};

type PublicReservaPayload = {
  nombre: string;
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

const buildPresupuestoPdf = async (input: {
  reservaId: number;
  salon: { nombre: string; descripcion?: string | null; precio_base: number; capacidad: number };
  distribucion?: { nombre: string; capacidad: number } | null;
  cliente: { nombre: string; email?: string | null };
  fechaInicio: string;
  fechaFin: string;
  tipoEvento?: string | null;
  cantidadPersonas: number;
  servicios: PresupuestoServicio[];
}) => {
  try {
    const mod = await import('npm:pdf-lib');
    const { PDFDocument, StandardFonts, rgb } = (mod as any);

    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 40;
    let y = height - margin;

    const small = 10;
    const normal = 12;
    const headerSize = 16;

    const accent = rgb(0.07, 0.38, 0.65);
    const muted = rgb(0.82, 0.84, 0.86);
    const textColor = rgb(0.12, 0.12, 0.12);

    const drawText = (text: string, x: number, yPos: number, size = small, opts: any = {}) => {
      page.drawText(String(text), { x, y: yPos, size, font: opts.bold ? helveticaBold : helvetica, color: opts.color ?? textColor });
    };

    const drawLine = (x: number, yPos: number, w: number, thickness = 1, color = muted) => {
      page.drawRectangle({ x, y: yPos - thickness / 2, width: w, height: thickness, color });
    };

    // Header
    drawText('Quinto Centenario', margin, y, 14, { bold: true, color: accent });
    drawText('PRESUPUESTO', width - margin - 140, y, 16, { bold: true });
    y -= headerSize + 6;
    drawLine(margin, y, width - margin * 2, 1.5);
    y -= 18;

    // Client / Meta box
    const boxHeight = 68;
    page.drawRectangle({ x: margin, y: y - boxHeight, width: width - margin * 2, height: boxHeight, color: rgb(0.97, 0.98, 0.99) });
    drawLine(margin, y - 2, width - margin * 2, 0.7, muted);

    const colGap = 30;
    const colWidth = (width - margin * 2 - colGap) / 2;
    const leftX = margin + 8;
    const rightX = margin + colWidth + colGap + 8;

    drawText(`Nombre: ${input.cliente.nombre}`, leftX, y - 20, normal);
    drawText(`Email: ${input.cliente.email ?? 'No informado'}`, leftX, y - 36, small);
    drawText(`Tipo: ${input.tipoEvento?.trim() || 'Evento'}`, leftX, y - 52, small);

    drawText(`Reserva #${input.reservaId}`, rightX, y - 20, normal, { bold: true });
    drawText(`Fecha: ${formatDate(input.fechaInicio)}`, rightX, y - 36, small);
    drawText(`Horario: ${formatTime(input.fechaInicio)} - ${formatTime(input.fechaFin)}`, rightX, y - 52, small);

    y -= boxHeight + 10;

    // Salon contratado
    drawText('SALON CONTRATADO', margin + 8, y, 12, { bold: true });
    y -= 16;
    drawText(input.salon.nombre, margin + 8, y, normal, { bold: true });
    drawText(input.salon.descripcion || 'Sin descripcion', margin + 8, y - 18, small);
    drawText(formatCurrency(input.salon.precio_base), width - margin - 120, y, normal, { color: textColor });
    y -= 36;

    // Servicios table header
    const tableX = margin + 8;
    const tableW = width - margin * 2 - 16;
    const colWidths = [tableW * 0.40, tableW * 0.30, tableW * 0.10, tableW * 0.20]; // name, desc, qty, price

    // Header row
    const headerH = 22;
    page.drawRectangle({ x: tableX, y: y - headerH, width: tableW, height: headerH, color: rgb(0.95, 0.95, 0.95) });
    drawText('Servicio', tableX + 4, y - 16, small, { bold: true });
    drawText('Descripcion', tableX + colWidths[0] + 6, y - 16, small, { bold: true });
    drawText('Cant.', tableX + colWidths[0] + colWidths[1] + 6, y - 16, small, { bold: true });
    drawText('Subtotal', tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y - 16, small, { bold: true });
    y -= headerH;

    let totalServicios = 0;
    const rowH = 18;

    const servicios = input.servicios || [];
    for (let i = 0; i < servicios.length; i++) {
      const s = servicios[i];
      const unit = Number(s.servicio.precio) || 0;
      const qty = Number(s.cantidad) || 1;
      const subtotal = unit * qty;
      totalServicios += subtotal;

      if (y < margin + 80) {
        pdfDoc.addPage();
        // not strictly correct for multi-page tables, but sufficient for now
      }

      // Row background alternate
      if (i % 2 === 1) {
        page.drawRectangle({ x: tableX, y: y - rowH, width: tableW, height: rowH, color: rgb(0.99, 0.99, 0.99) });
      }

      drawText(s.servicio.nombre, tableX + 4, y - 14, small);
      drawText(s.servicio.descripcion || 'Sin descripcion', tableX + colWidths[0] + 6, y - 14, small);
      drawText(String(qty), tableX + colWidths[0] + colWidths[1] + 6, y - 14, small);
      drawText(formatCurrency(subtotal), tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6, y - 14, small);

      // Separator line
      drawLine(tableX, y - rowH, tableW, 0.5, rgb(0.9, 0.9, 0.9));

      y -= rowH;
    }

    y -= 8;

    // Totals
    const totalGeneral = input.salon.precio_base + totalServicios;
    const totalsBoxH = 56;
    const totalsBoxW = 200;
    const totalsBoxX = width - margin - totalsBoxW;
    const totalsBoxY = y - totalsBoxH + 12;
    page.drawRectangle({ x: totalsBoxX, y: totalsBoxY, width: totalsBoxW, height: totalsBoxH, color: rgb(0.98, 0.98, 0.98) });

    const pad = 10;
    const line1Y = totalsBoxY + totalsBoxH - 12;
    const line2Y = totalsBoxY + totalsBoxH - 28;
    const line3Y = totalsBoxY + totalsBoxH - 44;

    drawText('Subtotal salon', totalsBoxX + pad, line1Y, small);
    {
      const txt = formatCurrency(input.salon.precio_base);
      const wTxt = helvetica.widthOfTextAtSize(txt, small);
      drawText(txt, totalsBoxX + totalsBoxW - pad - wTxt, line1Y, small);
    }

    drawText('Total servicios', totalsBoxX + pad, line2Y, small);
    {
      const txt = formatCurrency(totalServicios);
      const wTxt = helvetica.widthOfTextAtSize(txt, small);
      drawText(txt, totalsBoxX + totalsBoxW - pad - wTxt, line2Y, small);
    }

    drawText('Total general', totalsBoxX + pad, line3Y, normal, { bold: true });
    {
      const txt = formatCurrency(totalGeneral);
      const measure = typeof helveticaBold.widthOfTextAtSize === 'function' ? helveticaBold.widthOfTextAtSize(txt, normal) : helvetica.widthOfTextAtSize(txt, normal);
      drawText(txt, totalsBoxX + totalsBoxW - pad - measure, line3Y, normal, { bold: true });
    }

    y -= totalsBoxH + 8;

    // Footer note
    drawLine(margin, 80, width - margin * 2, 0.7);
    drawText('Este presupuesto es válido por 30 días. Para confirmar la reserva contacte al hotel.', margin, 68, small);

    const pdfBytes = await pdfDoc.save();
    return pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  } catch (err) {
    throw new Error('PDF generation failed: ' + (err?.message || String(err)));
  }
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

    if (!nombre || !fechaInicio || !fechaFin || !cantidad) {
      return c.json(
        { error: "Missing required fields: nombre, fecha_inicio, fecha_fin, cantidad" },
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

    if (new Date(fechaFin) <= new Date(fechaInicio)) {
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

    if (totalPersonas > salonData.capacidad) {
      return c.json(
        {
          error: `La capacidad maxima del salon seleccionado es de ${salonData.capacidad} personas`,
        },
        400,
      );
    }

    if (distribucionData && totalPersonas > distribucionData.capacidad) {
      return c.json(
        {
          error: `La distribucion elegida permite hasta ${distribucionData.capacidad} personas`,
        },
        400,
      );
    }

    let clienteId: number | null = null;

    if (email) {
      const { data: clienteExistente } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (clienteExistente) clienteId = clienteExistente.id;
    } else if (telefono) {
      const { data: clienteExistente } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("telefono", telefono)
        .limit(1)
        .maybeSingle();
      if (clienteExistente) clienteId = clienteExistente.id;
    } else {
      const { data: clienteExistente } = await supabaseAdmin
        .from("clientes")
        .select("*")
        .eq("nombre", nombre)
        .limit(1)
        .maybeSingle();
      if (clienteExistente) clienteId = clienteExistente.id;
    }

    if (clienteId) {
      await supabaseAdmin
        .from("clientes")
        .update({
          nombre,
          email,
          telefono,
        })
        .eq("id", clienteId);
    } else {
      const { data: nuevoCliente, error: clienteError } = await supabaseAdmin
        .from("clientes")
        .insert([
          {
            nombre,
            email,
            telefono,
          },
        ])
        .select()
        .single();

      if (clienteError || !nuevoCliente) {
        console.error("Error creando cliente:", clienteError);
        return c.json({ error: "No se pudo crear el cliente" }, 500);
      }

      clienteId = nuevoCliente.id;
    }

    const observacionesParts = [
      tipoEvento ? `Tipo de evento: ${tipoEvento}` : null,
      observaciones ? `Observaciones: ${observaciones}` : null,
    ].filter(Boolean);

    const reservaPayload = {
      id_cliente: clienteId,
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
          nombre,
          email,
        },
        fechaInicio,
        fechaFin,
        tipoEvento,
        cantidadPersonas: totalPersonas,
        servicios: serviciosDetalle,
      });

      const storagePath = `reservas/reserva-${reservaData.id}.pdf`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("presupuestos")
        .upload(storagePath, pdfBuffer, {
          cacheControl: "3600",
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        console.error("Error subiendo presupuesto:", uploadError);
        // don't fail the whole request; just continue without download URL
      } else {
        await supabaseAdmin
          .from("reservas")
          .update({ presupuesto_url: storagePath })
          .eq("id", reservaData.id);

        const { data: signedData, error: signedError } = await supabaseAdmin.storage
          .from("presupuestos")
          .createSignedUrl(storagePath, 60 * 15);

        if (signedError || !signedData) {
          console.error("Error creando URL firmada:", signedError);
        } else {
          downloadUrl = signedData.signedUrl;
        }
      }
    } catch (err) {
      console.warn("PDF generation failed or not available:", err?.message || err);
      // proceed without downloadUrl
    }

    return c.json({
      success: true,
      reservaId: reservaData.id,
      downloadUrl,
    });
  } catch (error) {
    console.error("Error in public-reserva endpoint:", error);
    return c.json({ error: error?.message ?? "Internal server error" }, 500);
  }
};

app.post("/make-server-484a241a/public-reserva", publicReservaHandler);
app.post("/server/make-server-484a241a/public-reserva", publicReservaHandler);

Deno.serve(app.fetch);
