import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useReaderStore } from "../../store/useReaderStroe";
import supabase from "../../utils/supabase";

function BookList() {
  // zustand store에서 상태와 액션 가져오기
  const { books, loading, error, fetchBooks } = useReaderStore();
  const [imageErrors, setImageErrors] = useState({});

  // 이미지 URL 생성 헬퍼 함수
  const getImageUrl = (coverUrl) => {
    if (!coverUrl) return null;

    // 이미 전체 URL인 경우 그대로 반환
    if (coverUrl.startsWith("http://") || coverUrl.startsWith("https://")) {
      return coverUrl;
    }

    // Supabase Storage 경로인 경우
    // cover_url 형식에 따라 처리
    // 예시:
    // - "book-covers/image.jpg" → 버킷: "book-covers", 경로: "image.jpg"
    // - "/book-covers/image.jpg" → 버킷: "book-covers", 경로: "image.jpg"
    // - "covers/folder/image.jpg" → 버킷: "covers", 경로: "folder/image.jpg"
    // - "image.jpg" → 기본 버킷 사용 또는 직접 경로

    // 경로에서 앞뒤 슬래시 정리
    let path = coverUrl.trim();
    if (path.startsWith("/")) {
      path = path.slice(1);
    }

    // 첫 번째 슬래시를 기준으로 버킷 이름과 파일 경로 분리
    const parts = path.split("/");

    if (parts.length >= 2) {
      // 버킷 이름과 파일 경로가 모두 있는 경우
      const bucketName = parts[0];
      const filePath = parts.slice(1).join("/");

      // Supabase Storage의 getPublicUrl 메서드 사용
      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);

      if (import.meta.env.DEV) {
        console.log("이미지 URL 생성:", {
          original: coverUrl,
          bucket: bucketName,
          filePath: filePath,
          final: data.publicUrl,
        });
      }

      return data.publicUrl;
    } else {
      // 버킷 이름이 없거나 파일명만 있는 경우
      // 기본 버킷 이름을 사용하거나 전체 경로로 처리
      // 일반적으로 "book-covers" 또는 "covers" 버킷을 사용
      const defaultBucket = "book-covers"; // 필요시 환경 변수로 설정 가능
      const filePath = path;

      try {
        const { data } = supabase.storage
          .from(defaultBucket)
          .getPublicUrl(filePath);

        if (import.meta.env.DEV) {
          console.log("이미지 URL 생성 (기본 버킷):", {
            original: coverUrl,
            bucket: defaultBucket,
            filePath: filePath,
            final: data.publicUrl,
          });
        }

        return data.publicUrl;
      } catch (err) {
        // getPublicUrl 실패 시 직접 URL 구성
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const fallbackUrl = `${supabaseUrl}/storage/v1/object/public/${defaultBucket}/${filePath}`;

        if (import.meta.env.DEV) {
          console.warn("getPublicUrl 실패, 직접 URL 사용:", fallbackUrl);
        }

        return fallbackUrl;
      }
    }
  };

  // 이미지 로드 실패 핸들러
  const handleImageError = (bookId, coverUrl) => {
    console.error("이미지 로드 실패:", {
      bookId,
      coverUrl,
      generatedUrl: getImageUrl(coverUrl),
    });
    setImageErrors((prev) => ({ ...prev, [bookId]: true }));
  };

  useEffect(() => {
    // 컴포넌트 마운트 시 책 목록 가져오기
    fetchBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 로딩 중일 때
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <p className="text-muted-foreground">책 목록을 불러오는 중...</p>
      </div>
    );
  }

  // 에러 발생 시
  if (error) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <p className="text-destructive mb-2">오류가 발생했습니다</p>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // 데이터가 없을 때
  if (books.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <p className="text-muted-foreground">등록된 책이 없습니다.</p>
      </div>
    );
  }

  // 책 목록 렌더링
  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-6">책 목록</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {books.map((book) => (
          <Link
            key={book.id}
            to={`/book/${book.id}`}
            className="group block bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
          >
            {/* 책 표지 이미지 */}
            {book.cover_url ? (
              <div className="aspect-[3/4] overflow-hidden bg-muted">
                {!imageErrors[book.id] ? (
                  <img
                    src={getImageUrl(book.cover_url)}
                    alt={book.title || "책 표지"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={() => handleImageError(book.id, book.cover_url)}
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">
                      이미지 로드 실패
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-[3/4] bg-muted flex items-center justify-center">
                <span className="text-muted-foreground text-sm">표지 없음</span>
              </div>
            )}

            {/* 책 정보 */}
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                {book.title}
              </h3>
              <p className="text-sm text-muted-foreground mb-2">
                {book.author || "저자 미상"}
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span
                  className={`px-2 py-1 rounded ${
                    book.is_published
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                  }`}
                >
                  {book.is_published ? "출간됨" : "미출간"}
                </span>
                {book.created_at && (
                  <span>
                    {new Date(book.created_at).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default BookList;
