type ErrorWithName = { name: string };

export function isS3NotFoundError(err: unknown): err is ErrorWithName {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as ErrorWithName).name === "NotFound"
  );
}
