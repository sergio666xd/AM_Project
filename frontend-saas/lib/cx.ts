/** Une clases condicionales: `cx("a", activo && "b")`. */
export function cx(...clases: (string | false | null | undefined)[]): string {
  return clases.filter(Boolean).join(" ");
}
