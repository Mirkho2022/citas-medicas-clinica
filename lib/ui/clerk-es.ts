// Textos en español de los formularios de Clerk (H2b, D7). Base: la variante `esMX` del paquete @clerk/localizations
// (español latinoamericano). docs/02-diseno/DESIGN.md pide hablarle de «usted» al paciente, y esa variante mezcla «tú» y «usted»:
// aquí se sobrescriben los textos de las pantallas por las que pasa un paciente (inicio de sesión, registro y
// verificación). Lo que no aparece aquí queda como lo trae el paquete; ver la lista de revisión en docs/07-testing/pruebas-e2e.md.
import { esMX } from "@clerk/localizations";

export const localizacionClerk: typeof esMX = {
  ...esMX,
  formFieldAction__forgotPassword: "¿Olvidó su contraseña?",
  formFieldInputPlaceholder__emailAddress: "Ingrese su correo electrónico",
  formFieldInputPlaceholder__password: "Ingrese su contraseña",
  // El paquete no traduce este texto y Clerk lo mostraba en inglés («Create a password»).
  formFieldInputPlaceholder__signUpPassword: "Cree una contraseña",
  signIn: {
    ...esMX.signIn,
    emailCode: {
      ...esMX.signIn?.emailCode,
      resendButton: "¿No recibió un código? Reenviar",
    },
    emailCodeMfa: {
      ...esMX.signIn?.emailCodeMfa,
      resendButton: "¿No recibió un código? Reenviar",
    },
    forgotPassword: {
      ...esMX.signIn?.forgotPassword,
      subtitle: "para restablecer su contraseña",
      subtitle_email: "Primero, ingrese el código enviado a su correo electrónico",
      resendButton: "¿No recibió un código? Reenviar",
    },
    newDeviceVerificationNotice:
      "Está iniciando sesión desde un dispositivo nuevo. Estamos pidiendo una verificación para mantener su cuenta segura.",
  },
  signUp: {
    ...esMX.signUp,
    start: {
      ...esMX.signUp?.start,
      title: "Cree su cuenta",
      titleCombined: "Cree su cuenta",
      actionText: "¿Ya tiene una cuenta?",
    },
    continue: {
      ...esMX.signUp?.continue,
      actionText: "¿Ya tiene una cuenta?",
    },
    emailCode: {
      ...esMX.signUp?.emailCode,
      title: "Verifique su correo electrónico",
      subtitle: "Ingrese el código de verificación enviado a su correo electrónico",
      formSubtitle: "Ingrese el código de verificación enviado a su correo electrónico",
      resendButton: "¿No recibió un código? Reenviar",
    },
  },
};
