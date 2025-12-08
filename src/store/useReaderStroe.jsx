import { create } from "zustand";
import supabase from "../utils/supabase";

export const useReaderStore = create((set, get) => ({
  // 현재 선택된 책
  book: null,
  setBook: (book) => set({ book }),

  // 책 목록 관련 상태
  books: [],
  loading: false,
  error: null,

  // 책 목록 가져오기 액션
  fetchBooks: async () => {
    try {
      set({ loading: true, error: null });

      const { data, error: fetchError } = await supabase
        .from("books")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      set({ books: data || [], loading: false, error: null });
    } catch (err) {
      console.error("책 목록을 가져오는 중 오류 발생:", err);
      set({
        error: err.message || "책 목록을 불러오는데 실패했습니다.",
        loading: false,
      });
    }
  },

  // 책 목록 초기화
  resetBooks: () => set({ books: [], loading: false, error: null }),

  // 페이지 관련 상태
  pages: [],
  pagesLoading: false,
  pagesError: null,
  currentPage: null,
  setCurrentPage: (page) => set({ currentPage: page }),

  // 특정 책의 페이지 목록 가져오기
  fetchPages: async (bookId) => {
    try {
      set({ pagesLoading: true, pagesError: null });

      const { data, error: fetchError } = await supabase
        .from("pages")
        .select("*")
        .eq("book_id", bookId)
        .order("page_no", { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      set({ pages: data || [], pagesLoading: false, pagesError: null });

      // 첫 페이지 설정
      if (data && data.length > 0) {
        set({ currentPage: data[0] });
      }
    } catch (err) {
      console.error("페이지 목록을 가져오는 중 오류 발생:", err);
      set({
        pagesError: err.message || "페이지 목록을 불러오는데 실패했습니다.",
        pagesLoading: false,
      });
    }
  },

  // 페이지 초기화
  resetPages: () =>
    set({
      pages: [],
      pagesLoading: false,
      pagesError: null,
      currentPage: null,
    }),
}));
