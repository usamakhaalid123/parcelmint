"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";

import { addToCartAction, type AddToCartActionState } from "@/modules/checkout/server/actions";

function AddButton({ available }: { available: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="button-primary" disabled={!available || pending} type="submit">
      {pending ? "Adding…" : available ? "Add to cart" : "Out of stock"}
    </button>
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
    <form action={action} className="mb-8 flex items-end gap-3">
      <input name="variantId" type="hidden" value={variantId} />
      <label className="grid gap-2 font-bold">
        Quantity
        <input className="w-20" defaultValue={1} max={99} min={1} name="quantity" type="number" />
      </label>
      <AddButton available={available} />
      {state.status === "error" ? (
        <span className="text-sm font-bold text-red-700" role="alert">
          This item could not be added. Check availability and try again.
        </span>
      ) : null}
    </form>
  );
}
