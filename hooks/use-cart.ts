"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface CartItemSeller {
  displayName: string;
  avatarUrl?: string;
}

interface CartItem {
  listingId: string;
  priceSnapshot: number;
  currency: string;
  addedAt: string;
  title: string;
  shortDescription: string;
  category?: string;
  currentPrice: number;
  priceChanged: boolean;
  isAvailable: boolean;
  alreadyPurchased: boolean;
  isOwnListing: boolean;
  seller: CartItemSeller | null;
  platformFee: number;
  sellerPayout: number;
}

interface CartState {
  items: CartItem[];
  itemCount: number;
  validItemCount: number;
  subtotal: number;
  platformFees: number;
  total: number;
}

export function useCart() {
  const [cart, setCart] = useState<CartState>({
    items: [],
    itemCount: 0,
    validItemCount: 0,
    subtotal: 0,
    platformFees: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const { toast } = useToast();

  const fetchCart = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketplace/cart");
      const data = await res.json();

      if (res.ok) {
        setCart({
          items: data.items || [],
          itemCount: data.itemCount || 0,
          validItemCount: data.validItemCount || 0,
          subtotal: data.subtotal || 0,
          platformFees: data.platformFees || 0,
          total: data.total || 0,
        });
      }
    } catch (error) {
      console.error("Failed to fetch cart:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const addToCart = useCallback(
    async (listingId: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/marketplace/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });

        const data = await res.json();

        if (res.ok) {
          toast({
            title: "Added to cart",
            description: "Item has been added to your cart",
          });
          await fetchCart();
          return true;
        } else {
          toast({
            title: "Failed to add to cart",
            description: data.error || "Something went wrong",
            variant: "destructive",
          });
          return false;
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to add to cart",
          variant: "destructive",
        });
        return false;
      }
    },
    [fetchCart, toast]
  );

  const removeFromCart = useCallback(
    async (listingId: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/marketplace/cart/${listingId}`, {
          method: "DELETE",
        });

        const data = await res.json();

        if (res.ok) {
          toast({
            title: "Removed from cart",
            description: "Item has been removed from your cart",
          });
          await fetchCart();
          return true;
        } else {
          toast({
            title: "Failed to remove",
            description: data.error || "Something went wrong",
            variant: "destructive",
          });
          return false;
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to remove from cart",
          variant: "destructive",
        });
        return false;
      }
    },
    [fetchCart, toast]
  );

  const checkout = useCallback(async (): Promise<string | null> => {
    setCheckingOut(true);
    try {
      const successUrl = `${window.location.origin}/marketplace/purchase/success?purchaseIds={purchaseIds}`;

      const res = await fetch("/api/marketplace/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ successUrl }),
      });

      const data = await res.json();

      if (res.ok && data.checkoutUrl) {
        return data.checkoutUrl;
      } else {
        toast({
          title: "Checkout failed",
          description: data.error || "Failed to start checkout",
          variant: "destructive",
        });
        return null;
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to checkout",
        variant: "destructive",
      });
      return null;
    } finally {
      setCheckingOut(false);
    }
  }, [toast]);

  const isInCart = useCallback(
    (listingId: string): boolean => {
      return cart.items.some((item) => item.listingId === listingId);
    },
    [cart.items]
  );

  // Fetch cart on mount
  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  return {
    cart,
    loading,
    checkingOut,
    fetchCart,
    addToCart,
    removeFromCart,
    checkout,
    isInCart,
  };
}
