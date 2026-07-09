// Decoración del panel de marca (pantallas de ingreso). En lugar de "burbujas"
// con iconos, usamos figuras geométricas de contorno (aros y rombos) que flotan
// suavemente: más sobrio y original, sin iconos.
export function AuthBackgroundDecor() {
  return (
    <div className="bo-auth-bg-decor" aria-hidden="true">
      <span className="bo-auth-bg-shape bo-auth-bg-shape--blob bo-auth-bg-blob-1" />
      <span className="bo-auth-bg-shape bo-auth-bg-shape--blob bo-auth-bg-blob-2" />
      <span className="bo-auth-bg-shape bo-auth-bg-geo bo-auth-bg-ring bo-auth-bg-geo-1" />
      <span className="bo-auth-bg-shape bo-auth-bg-geo bo-auth-bg-diamond bo-auth-bg-geo-2" />
      <span className="bo-auth-bg-shape bo-auth-bg-geo bo-auth-bg-ring bo-auth-bg-geo-3" />
      <span className="bo-auth-bg-shape bo-auth-bg-geo bo-auth-bg-diamond bo-auth-bg-geo-4" />
    </div>
  );
}
