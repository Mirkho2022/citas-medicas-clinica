"use client";

import { UserButton, useUser } from "@clerk/nextjs";

// Pie de la barra lateral de la consola: el avatar de Clerk (menú de la cuenta) y el nombre. El nombre se recorta con puntos
// suspensivos: con `UserButton showName` un nombre o un correo largo empujaba el avatar fuera de la barra de 240 px y lo dejaba
// encima del contenido (revisión visual de H3, 13.3). `showName` no se deja acotar con clases: los estilos de Clerk ganan a Tailwind.
export function PieUsuario() {
  const { user } = useUser();
  const nombre = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserButton />
      {nombre ? (
        <span className="min-w-0 truncate text-body-sm text-ink" title={nombre}>
          {nombre}
        </span>
      ) : null}
    </div>
  );
}
