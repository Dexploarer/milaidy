export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.prototype.toString.call(value) !== "[object Object]"
  ) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  const Ctor = Object.hasOwn(proto, "constructor") && proto.constructor;
  return (
    typeof Ctor === "function" &&
    Ctor instanceof Ctor &&
    Function.prototype.toString.call(Ctor) ===
      Function.prototype.toString.call(Object)
  );
}
