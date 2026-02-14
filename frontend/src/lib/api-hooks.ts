import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./axios";

// ============ Types ============

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

// Dashboard
export interface DashboardData {
  user: { name: string; company_name: string };
  stat_cards: {
    maintenance_count: number;
    task_count: number;
    news_count: number;
    estimate_count: number;
  };
  recent_activities: {
    id: number;
    type: string;
    title: string;
    date: string;
    status: string;
  }[];
  maintenance_stats: {
    pending: number;
    in_progress: number;
    completed: number;
    monthly_requests: number;
  };
  response_rate: number;
  worker_stats: {
    name: string;
    completed_count: number;
    in_progress_count: number;
  }[];
  latest_news: {
    id: number;
    title: string;
    category: string;
    created_at: string;
  }[];
  monthly_payment: {
    total_amount: number;
    count: number;
  };
  point_summary: {
    total_points: number;
    used_points: number;
    remaining_points: number;
    point_percent: number;
  };
  project_progress: {
    id: number;
    title: string;
    status: string;
    total_tasks: number;
    completed_tasks: number;
    progress: number;
    contract_date: string | null;
    contract_termination_date: string | null;
    project_type: string | null;
    monthly_point: number;
  }[];
}

// Maintenance
export interface MaintenanceItem {
  id: number;
  title: string;
  status: string;
  request_date: string;
  project_title: string | null;
  comments_count: number;
}

export interface MaintenanceComment {
  id: number;
  author: string;
  role: "manager" | "customer";
  content: string;
  created_at: string;
  worker_type: string | null;
  attachment: string | null;
  attachments: { id: number; name: string; url: string }[];
  parent_id: number | null;
  replies?: MaintenanceComment[];
}

export interface MaintenanceDetail {
  id: number;
  title: string;
  content: string;
  status: string;
  request_date: string;
  worker_type: string | null;
  worker_name: string | null;
  used_points: number;
  project_title: string | null;
  attachments: { id: number; name: string; size: string; url: string }[];
  comments: MaintenanceComment[];
}

// News
export interface NewsItem {
  id: number;
  title: string;
  writer_name: string;
  views: number;
  created_at: string;
  category: string;
}

export interface NewsDetail {
  id: number;
  title: string;
  content: string;
  writer_name: string;
  views: number;
  created_at: string;
  category: string;
  attachment_url: string | null;
}

// Tasks (Inditask)
export interface TaskItem {
  id: number;
  title: string;
  task_type: string;
  task_type_label: string;
  status: string;
  created_at: string;
  deadline: string | null;
}

export interface TaskComment {
  id: number;
  author: string;
  role: "manager" | "customer";
  content: string;
  created_at: string;
}

export interface TaskDetail {
  id: number;
  title: string;
  content: string;
  task_type: string;
  task_type_label: string;
  status: string;
  created_at: string;
  deadline: string | null;
  worker_name: string | null;
  budget: string | null;
  attachments: { name: string; size: string; url: string }[];
  comments: TaskComment[];
}

// Estimates
export interface EstimateItem {
  id: number;
  title: string;
  status: string;
  total_amount: number;
  created_at: string;
}

export interface EstimateLineItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
}

export interface EstimateDetail {
  id: number;
  title: string;
  status: string;
  created_at: string;
  valid_until: string | null;
  company_name: string | null;
  items: EstimateLineItem[];
  subtotal: number;
  discount: number;
  discount_description: string;
  tax: number;
  total: number;
  notes: string | null;
}

// Maintenance Projects (for create form)
export interface MaintenanceProject {
  id: number;
  title: string;
  permit: boolean;
  remaining_points: number;
  contract_status: string;
  contract_date: string | null;
  contract_termination_date: string | null;
}

// Point Usage
export interface PointUsageProject {
  id: number;
  title: string;
  monthly_point: number;
  contract_date: string;
  contract_termination_date: string;
}

export interface PointUsageProjectBalance {
  id: number;
  title: string;
  monthly_point: number;
  remaining_points: number;
  total_points: number;
}

export interface PointUsageHistoryItem {
  id: number;
  created_at: string;
  content: string;
  point_type: number;
  point: number;
  status: number;
  worker_type: number | null;
  managelist_title: string;
}

export interface PointUsageWorkerStat {
  writer_name: string;
  worker_type: number;
  total_used: number;
  usage_count: number;
}

export interface PointUsageChartData {
  month: string;
  usage: number;
}

export interface PointUsageData {
  maintenance_customer: boolean;
  current_project: PointUsageProject | null;
  projects_with_balance: PointUsageProjectBalance[];
  period_start: string;
  period_end: string;
  total_points: number;
  used_points: number;
  remaining_points: number;
  worker_stats: PointUsageWorkerStat[];
  point_histories: {
    items: PointUsageHistoryItem[];
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
  chart_data: PointUsageChartData[];
  search_text: string;
  date_from: string;
  date_to: string;
  point_type_filter: string;
}

// Inquiries
export interface InquiryItem {
  id: number;
  title: string;
  status: number;
  status_label: string;
  inquiry_type: number;
  inquiry_type_label: string;
  created_at: string;
  answer_count: number;
}

export interface InquiryAnswer {
  id: number;
  author: string;
  role: string;
  content: string;
  parent_answer_id: number | null;
  created_at: string;
}

export interface InquiryDetail {
  id: number;
  title: string;
  content: string;
  status: number;
  status_label: string;
  inquiry_type: number;
  inquiry_type_label: string;
  priority: string;
  created_at: string;
  updated_at: string;
  writer_name: string;
  attachments: { id: number; name: string; url: string; uploaded_at: string }[];
  answers: InquiryAnswer[];
}

// ============ API Functions ============

async function fetchDashboard(): Promise<DashboardData> {
  const { data } = await api.get("/dashboard");
  return data;
}

async function fetchMaintenanceList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
}): Promise<PaginatedResponse<MaintenanceItem>> {
  const { data } = await api.get("/maintenance", { params });
  return data;
}

async function fetchMaintenanceDetail(id: number): Promise<MaintenanceDetail> {
  const { data } = await api.get(`/maintenance/${id}`);
  return data;
}

async function fetchNewsList(params: {
  page?: number;
  per_page?: number;
  search?: string;
}): Promise<PaginatedResponse<NewsItem>> {
  const { data } = await api.get("/news", { params });
  return data;
}

async function fetchNewsDetail(id: number): Promise<NewsDetail> {
  const { data } = await api.get(`/news/${id}`);
  return data;
}

async function fetchTaskList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  task_type?: string;
}): Promise<PaginatedResponse<TaskItem>> {
  const { data } = await api.get("/tasks", { params });
  return data;
}

async function fetchTaskDetail(id: number): Promise<TaskDetail> {
  const { data } = await api.get(`/tasks/${id}`);
  return data;
}

async function fetchEstimateList(params: {
  page?: number;
  per_page?: number;
  search?: string;
}): Promise<PaginatedResponse<EstimateItem>> {
  const { data } = await api.get("/estimates", { params });
  return data;
}

async function fetchEstimateDetail(id: number): Promise<EstimateDetail> {
  const { data } = await api.get(`/estimates/${id}`);
  return data;
}

async function fetchPointUsage(params: {
  project_id?: number;
  search_text?: string;
  date_from?: string;
  date_to?: string;
  point_type?: string;
  page?: number;
  per_page?: number;
}): Promise<PointUsageData> {
  const { data } = await api.get("/point-usage", { params });
  return data;
}

async function fetchMaintenanceProjects(): Promise<{ projects: MaintenanceProject[] }> {
  const { data } = await api.get("/maintenance/projects");
  return data;
}

async function createMaintenance(formData: FormData): Promise<{ id: number; message: string }> {
  const { data } = await api.post("/maintenance", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

async function createMaintenanceComment(maintenanceId: number, formData: FormData): Promise<{ id: number; message: string }> {
  const { data } = await api.post(`/maintenance/${maintenanceId}/comments`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

async function createTask(formData: FormData): Promise<{ id: number; message: string }> {
  const { data } = await api.post("/tasks", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

async function fetchInquiryList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
}): Promise<PaginatedResponse<InquiryItem>> {
  const { data } = await api.get("/inquiries", { params });
  return data;
}

async function fetchInquiryDetail(id: number): Promise<InquiryDetail> {
  const { data } = await api.get(`/inquiries/${id}`);
  return data;
}

async function createInquiry(formData: FormData): Promise<{ id: number; message: string }> {
  const { data } = await api.post("/inquiries", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

async function createInquiryAnswer(inquiryId: number, formData: FormData): Promise<{ id: number; message: string }> {
  const { data } = await api.post(`/inquiries/${inquiryId}/answers`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ============ Hooks ============

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });
}

export function useMaintenanceList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
} = {}) {
  return useQuery({
    queryKey: ["maintenance", "list", params],
    queryFn: () => fetchMaintenanceList(params),
  });
}

export function useMaintenanceDetail(id: number) {
  return useQuery({
    queryKey: ["maintenance", "detail", id],
    queryFn: () => fetchMaintenanceDetail(id),
    enabled: !!id,
  });
}

export function useNewsList(params: {
  page?: number;
  per_page?: number;
  search?: string;
} = {}) {
  return useQuery({
    queryKey: ["news", "list", params],
    queryFn: () => fetchNewsList(params),
  });
}

export function useNewsDetail(id: number) {
  return useQuery({
    queryKey: ["news", "detail", id],
    queryFn: () => fetchNewsDetail(id),
    enabled: !!id,
  });
}

export function useTaskList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  task_type?: string;
} = {}) {
  return useQuery({
    queryKey: ["tasks", "list", params],
    queryFn: () => fetchTaskList(params),
  });
}

export function useTaskDetail(id: number) {
  return useQuery({
    queryKey: ["tasks", "detail", id],
    queryFn: () => fetchTaskDetail(id),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useEstimateList(params: {
  page?: number;
  per_page?: number;
  search?: string;
} = {}) {
  return useQuery({
    queryKey: ["estimates", "list", params],
    queryFn: () => fetchEstimateList(params),
  });
}

export function useEstimateDetail(id: number) {
  return useQuery({
    queryKey: ["estimates", "detail", id],
    queryFn: () => fetchEstimateDetail(id),
    enabled: !!id,
  });
}

export function usePointUsage(params: {
  project_id?: number;
  search_text?: string;
  date_from?: string;
  date_to?: string;
  point_type?: string;
  page?: number;
  per_page?: number;
} = {}) {
  return useQuery({
    queryKey: ["point-usage", params],
    queryFn: () => fetchPointUsage(params),
  });
}

export function useMaintenanceProjects() {
  return useQuery({
    queryKey: ["maintenance", "projects"],
    queryFn: fetchMaintenanceProjects,
  });
}

export function useCreateMaintenance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMaintenance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}

export function useCreateMaintenanceComment(maintenanceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => createMaintenanceComment(maintenanceId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance", "detail", maintenanceId] });
    },
  });
}

export function useInquiryList(params: {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
} = {}) {
  return useQuery({
    queryKey: ["inquiries", "list", params],
    queryFn: () => fetchInquiryList(params),
  });
}

export function useInquiryDetail(id: number) {
  return useQuery({
    queryKey: ["inquiries", "detail", id],
    queryFn: () => fetchInquiryDetail(id),
    enabled: !!id,
  });
}

export function useCreateInquiry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createInquiry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
    },
  });
}

export function useCreateInquiryAnswer(inquiryId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => createInquiryAnswer(inquiryId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inquiries", "detail", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["inquiries", "list"] });
    },
  });
}
