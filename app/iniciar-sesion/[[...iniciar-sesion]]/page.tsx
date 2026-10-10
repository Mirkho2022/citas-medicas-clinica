import { SignIn } from "@clerk/nextjs";
import { Marca } from "@/components/clinica/marca";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 py-10">
      <Marca />
      <SignIn />
    </main>
  );
}
