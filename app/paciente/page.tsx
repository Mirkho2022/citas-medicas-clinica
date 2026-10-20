import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirRol } from "@/lib/auth/rol";

export default async function PaginaPaciente() {
  await auth.protect();
  await exigirRol("paciente");

  return (
    <>
      <h1 className="font-display text-headline-lg text-ink sm:text-display-lg">Portal del paciente</h1>
      <Card>
        <CardHeader>
          <CardTitle>Reserve su cita</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>Muy pronto podrá reservar y cancelar sus citas desde aquí, sin llamar a la clínica.</p>
          <Button size="lg" disabled>
            Reservar cita (próximamente)
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
