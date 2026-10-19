const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Correo con los accesos de un usuario. `reset` indica que la clave fue regenerada.
// Estilos en línea y tablas: es lo que soportan de forma fiable los clientes de correo.
function credentialsEmail({ name, username, password, loginUrl, reset = false }) {
  const title = reset ? 'Tus nuevos accesos' : 'Bienvenido a PARAGON';
  const intro = reset
    ? 'Se generó una nueva contraseña temporal para tu cuenta.'
    : 'Tu cuenta en la guild ya está lista. Estos son tus datos de ingreso.';
  const subject = reset ? 'PARAGON · Tus nuevos accesos' : 'PARAGON · Tus accesos a la guild';

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0e14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#111824;border:1px solid #a8752a;border-radius:16px;overflow:hidden;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e9e9ef;">
      <tr><td align="center" style="padding:36px 24px 8px;background:#0f1420;">
        <img src="cid:paragon-logo" width="120" height="120" alt="PARAGON" style="display:block;border-radius:60px;border:2px solid #a8752a;">
        <div style="margin-top:16px;font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:6px;font-weight:bold;color:#f4c66d;">PARAGON</div>
        <div style="font-size:12px;letter-spacing:4px;color:#ff7a1a;text-transform:uppercase;padding-bottom:20px;">Guild de Smash MU</div>
      </td></tr>
      <tr><td style="height:3px;background:#ff7a1a;background-image:linear-gradient(90deg,#0f1420,#ff7a1a,#0f1420);font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:32px 32px 8px;">
        <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#f4c66d;">${esc(title)}, ${esc(name)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#c9ced8;">${esc(intro)}</p>
      </td></tr>
      <tr><td style="padding:20px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;border:1px solid #313947;border-radius:12px;">
          <tr><td style="padding:16px 20px 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9da4b3;">Usuario</td></tr>
          <tr><td style="padding:0 20px 14px;font-family:Consolas,'Courier New',monospace;font-size:20px;color:#f4c66d;">${esc(username)}</td></tr>
          <tr><td style="padding:4px 20px 4px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9da4b3;border-top:1px solid #313947;">Contraseña temporal</td></tr>
          <tr><td style="padding:0 20px 16px;font-family:Consolas,'Courier New',monospace;font-size:20px;color:#f4c66d;">${esc(password)}</td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#2a1a0a;border-left:4px solid #ff7a1a;border-radius:6px;">
          <tr><td style="padding:12px 16px;font-size:14px;line-height:1.5;color:#ffd9b0;">
            <strong>Importante:</strong> por seguridad, el sistema te pedirá cambiar esta contraseña la primera vez que ingreses.
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:28px 32px 12px;">
        <a href="${esc(loginUrl)}" style="display:inline-block;padding:14px 36px;background:#f4c66d;background-image:linear-gradient(135deg,#f4c66d,#ff7a1a);border-radius:999px;color:#1a1004;font-weight:bold;font-size:14px;letter-spacing:1px;text-decoration:none;text-transform:uppercase;">Ingresar a PARAGON</a>
        <p style="margin:16px 0 0;font-size:12px;color:#9da4b3;word-break:break-all;">Si el botón no funciona, copia este enlace:<br><a href="${esc(loginUrl)}" style="color:#f4c66d;">${esc(loginUrl)}</a></p>
      </td></tr>
      <tr><td style="padding:24px 32px 32px;border-top:1px solid #313947;font-size:12px;line-height:1.6;color:#9da4b3;text-align:center;">
        No compartas esta contraseña con nadie. Si no esperabas este correo, ignóralo o avisa a un oficial de la guild.<br>
        <span style="color:#a8752a;">Forjados en fuego. Unidos en cada invasión.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = `${title}, ${name}

${intro}

Usuario: ${username}
Contraseña temporal: ${password}

Por seguridad, el sistema te pedirá cambiar esta contraseña la primera vez que ingreses.

Ingresa aquí: ${loginUrl}

No compartas esta contraseña con nadie. Si no esperabas este correo, ignóralo o avisa a un oficial.

PARAGON · Guild de Smash MU`;

  return { subject, html, text };
}

// Correo de prueba de la configuración SMTP.
function testEmail() {
  const subject = 'PARAGON · Prueba de correo';
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0b0e14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#111824;border:1px solid #a8752a;border-radius:16px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e9e9ef;">
    <tr><td align="center" style="padding:32px 24px 8px;">
      <img src="cid:paragon-logo" width="88" height="88" alt="PARAGON" style="display:block;border-radius:44px;border:2px solid #a8752a;">
      <div style="margin-top:14px;font-family:Georgia,serif;font-size:24px;letter-spacing:5px;font-weight:bold;color:#f4c66d;">PARAGON</div>
    </td></tr>
    <tr><td style="padding:20px 32px 32px;text-align:center;">
      <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:20px;color:#f4c66d;">¡El correo funciona!</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#c9ced8;">Este es un mensaje de prueba. Si lo estás leyendo, la configuración SMTP de la web es correcta y ya se pueden enviar los accesos a los miembros.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const text = 'PARAGON · ¡El correo funciona! Este es un mensaje de prueba: la configuración SMTP de la web es correcta.';
  return { subject, html, text };
}

// Correo con el enlace para restablecer la contraseña.
function resetEmail({ name, resetUrl }) {
  const subject = 'PARAGON · Restablece tu contraseña';
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#0b0e14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0e14;padding:32px 12px;"><tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#111824;border:1px solid #a8752a;border-radius:16px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e9e9ef;">
    <tr><td align="center" style="padding:32px 24px 8px;">
      <img src="cid:paragon-logo" width="96" height="96" alt="PARAGON" style="display:block;border-radius:48px;border:2px solid #a8752a;">
      <div style="margin-top:14px;font-family:Georgia,serif;font-size:26px;letter-spacing:5px;font-weight:bold;color:#f4c66d;">PARAGON</div>
    </td></tr>
    <tr><td style="padding:20px 32px 8px;">
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:21px;color:#f4c66d;">Hola, ${esc(name)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#c9ced8;">Recibimos una solicitud para restablecer tu contraseña. Pulsa el botón para elegir una nueva. El enlace es válido por <b>1 hora</b> y solo se puede usar una vez.</p>
    </td></tr>
    <tr><td align="center" style="padding:26px 32px 12px;">
      <a href="${esc(resetUrl)}" style="display:inline-block;padding:14px 36px;background:#f4c66d;background-image:linear-gradient(135deg,#f4c66d,#ff7a1a);border-radius:999px;color:#1a1004;font-weight:bold;font-size:14px;letter-spacing:1px;text-decoration:none;text-transform:uppercase;">Elegir nueva contraseña</a>
      <p style="margin:16px 0 0;font-size:12px;color:#9da4b3;word-break:break-all;">Si el botón no funciona, copia este enlace:<br><a href="${esc(resetUrl)}" style="color:#f4c66d;">${esc(resetUrl)}</a></p>
    </td></tr>
    <tr><td style="padding:22px 32px 30px;border-top:1px solid #313947;font-size:12px;line-height:1.6;color:#9da4b3;text-align:center;">
      Si tú no lo pediste, ignora este correo: tu contraseña actual sigue funcionando y nadie puede cambiarla sin este enlace.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
  const text = `Hola, ${name}

Recibimos una solicitud para restablecer tu contraseña de PARAGON. Abre este enlace para elegir una nueva (válido por 1 hora, un solo uso):

${resetUrl}

Si tú no lo pediste, ignora este correo: tu contraseña actual sigue funcionando.`;
  return { subject, html, text };
}

module.exports = { credentialsEmail, testEmail, resetEmail };
