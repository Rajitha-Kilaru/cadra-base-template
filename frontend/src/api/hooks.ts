import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as client from './client';
import type { OrderStatus, CreateOrderRequest, AddLineRequest, TransitionRequest, AddNoteRequest } from './types';

export function useOrders(filters: { status?: string; q?: string; page?: number; page_size?: number }) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => client.listOrders(filters),
    placeholderData: prev => prev,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => client.getOrder(id!),
    enabled: !!id,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderRequest) => client.createOrder(data),
    onSuccess: (order) => {
      qc.setQueryData(['order', order.order_id], order);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAddLine(orderId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddLineRequest) => client.addLine(orderId!, data),
    onSuccess: (order) => {
      qc.setQueryData(['order', orderId], order);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useTransition(orderId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TransitionRequest) => client.transition(orderId!, data),
    onSuccess: (order) => {
      qc.setQueryData(['order', orderId], order);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useAddNote(orderId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AddNoteRequest) => client.addNote(orderId!, data),
    onSuccess: (order) => {
      qc.setQueryData(['order', orderId], order);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useFarms() {
  return useQuery({
    queryKey: ['farms'],
    queryFn: () => client.listFarms(),
    placeholderData: prev => prev,
  });
}

export function useFarm(id: string | undefined) {
  return useQuery({
    queryKey: ['farm', id],
    queryFn: () => client.getFarm(id!),
    enabled: !!id,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => client.listProducts(),
    placeholderData: prev => prev,
  });
}

export function useProduct(code: string | undefined) {
  return useQuery({
    queryKey: ['product', code],
    queryFn: () => client.getProduct(code!),
    enabled: !!code,
  });
}

export function useCreateFarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; name: string; credit_hold?: boolean; state?: string }) => client.createFarm(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['farms'] }); },
  });
}

export function useUpdateFarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; credit_hold?: boolean; state?: string }) => client.updateFarm(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['farms'] }); },
  });
}

export function useDeleteFarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.deleteFarm(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['farms'] }); },
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; description: string; active?: boolean; unit_price?: number; stock_available?: number; stock_reserved?: number; labels?: { crop: string; state: string; stage_min: number; stage_max: number }[] }) => client.createProduct(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, ...data }: { code: string; description: string; active?: boolean; unit_price?: number; stock_available?: number; stock_reserved?: number; labels?: { crop: string; state: string; stage_min: number; stage_max: number }[] }) => client.updateProduct(code, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => client.deleteProduct(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); },
  });
}