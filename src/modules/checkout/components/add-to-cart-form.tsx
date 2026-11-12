"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import { Alert, Button, Input } from "@/components/ui";
import { addToCartAction, type AddToCartActionState } from "@/modules/checkout/server/actions";

function AddButton({ available }: { available: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={!available || pending} type="submit">
      {pending ? "Adding…" : available ? "Add to cart" : "Out of stock"}
    </Button>
  );
}

export function AddToCartForm({ available, variantId }: { available: boolean; variantId: string }) {
  const router = useRouter();
  const initialState: AddToCartActionState = { status: "idle" };
  const [state, action] = useActionState(addToCartAction, initialState, "/cart?notice=added");

  useEffect(() => {
    if (state.status === "success") router.push("/cart?notice=added");
  }, [router, state]);

  return (
    <form action={action} className="grid grid-cols-[6rem_1fr] items-end gap-3">
      <input name="variantId" type="hidden" value={variantId} />
      <label className="grid gap-2 text-sm font-bold">
        Quantity
        <Input defaultValue={1} max={99} min={1} name="quantity" type="number" />
      </label>
      <AddButton available={available} />
      {state.status === "error" ? (
        <Alert className="col-span-full" role="alert" tone="error">
          This item could not be added. Check availability and try again.
        </Alert>
      ) : null}
    </form>
  );
}
