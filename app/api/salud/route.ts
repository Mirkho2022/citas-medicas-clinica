import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`select 1`;
    return NextResponse.json({ estado: "ok" });
  } catch {
    return NextResponse.json({ estado: "error" }, { status: 500 });
  }
}

const errorDeTipoDeliberado: number = "esto no es un numero";
