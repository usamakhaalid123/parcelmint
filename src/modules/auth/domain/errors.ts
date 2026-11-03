export class AuthorizationDeniedError extends Error {
  constructor() {
    super("The requested operation is not permitted");
    this.name = "AuthorizationDeniedError";
  }
}

export class AuthorizationReferenceNotFoundError extends Error {
  constructor(reference: "role" | "user") {
    super(`Authorization ${reference} was not found`);
    this.name = "AuthorizationReferenceNotFoundError";
  }
}
