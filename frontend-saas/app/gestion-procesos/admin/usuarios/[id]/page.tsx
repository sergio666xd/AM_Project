import { FichaUsuarioAdmin } from "@/components/admin/usuarios/FichaUsuarioAdmin";

export default async function AdminUsuarioRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaUsuarioAdmin usuarioId={Number(id)} />;
}
