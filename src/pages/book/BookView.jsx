import React, { useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReaderStore } from "../../store/useReaderStroe";
import supabase from "../../utils/supabase";

function BookView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { book, pages, pagesLoading, pagesError, fetchPages, setBook, books } =
    useReaderStore();

  // 이미지 URL 생성 헬퍼 함수
  const getImageUrl = (imageUrl) => {
    if (!imageUrl) return null;

    // 이미 전체 URL인 경우 그대로 반환
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      return imageUrl;
    }

    // Supabase Storage 경로인 경우
    let path = imageUrl.trim();
    if (path.startsWith("/")) {
      path = path.slice(1);
    }

    const parts = path.split("/");
    if (parts.length >= 2) {
      const bucketName = parts[0];
      const filePath = parts.slice(1).join("/");
      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      return data.publicUrl;
    } else {
      const defaultBucket = "book-covers";
      const { data } = supabase.storage.from(defaultBucket).getPublicUrl(path);
      return data.publicUrl;
    }
  };

  // text JSON에서 sentences 배열의 s, e 값을 추출하고 시간을 계산하는 함수
  const getPageTime = (page) => {
    if (!page.text) return null;

    try {
      const textData =
        typeof page.text === "string" ? JSON.parse(page.text) : page.text;

      // sentences 배열이 있는지 확인
      if (
        textData &&
        Array.isArray(textData.sentences) &&
        textData.sentences.length > 0
      ) {
        let minStart = Infinity;
        let maxEnd = -Infinity;

        // sentences 배열의 각 항목에서 s, e 값을 찾아서 최소 시작 시간과 최대 종료 시간 계산
        textData.sentences.forEach((sentence, index) => {
          if (
            sentence &&
            typeof sentence.s !== "undefined" &&
            typeof sentence.e !== "undefined"
          ) {
            const startTime = sentence.s;
            const endTime = sentence.e;

            // 최소 시작 시간과 최대 종료 시간 업데이트
            if (startTime < minStart) {
              minStart = startTime;
            }
            if (endTime > maxEnd) {
              maxEnd = endTime;
            }
          }
        });

        // 유효한 시간 값이 있는 경우
        if (minStart !== Infinity && maxEnd !== -Infinity) {
          // 시간 차이 계산
          const duration = maxEnd - minStart;

          // 밀리초인 경우 초로 변환 (1000 이상이면 밀리초로 간주)
          const durationInSeconds =
            duration > 1000 ? duration / 1000 : duration;
          const startInSeconds = minStart > 1000 ? minStart / 1000 : minStart;
          const endInSeconds = maxEnd > 1000 ? maxEnd / 1000 : maxEnd;

          return {
            start: startInSeconds,
            end: endInSeconds,
            duration: durationInSeconds,
            sentenceCount: textData.sentences.length,
          };
        }
      }
    } catch (err) {
      console.error("페이지 시간 파싱 오류:", err);
    }

    return null;
  };

  // 시간을 포맷팅하는 함수 (초 → 분:초)
  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return "0:00";

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 전체 시간 계산
  const totalTime = useMemo(() => {
    let total = 0;
    pages.forEach((page) => {
      const timeData = getPageTime(page);
      if (timeData && timeData.duration) {
        total += timeData.duration;
      }
    });
    return total;
  }, [pages]);

  useEffect(() => {
    // id가 없으면 종료
    if (!id) return;

    // 책 정보와 페이지를 가져오는 함수
    const fetchBookAndPages = async (bookId) => {
      try {
        // books 배열에서 먼저 찾기
        if (books.length > 0) {
          const foundBook = books.find((b) => b.id === bookId);
          if (foundBook) {
            setBook(foundBook);
            await fetchPages(bookId);
            return;
          }
        }

        // books 배열에 없으면 직접 데이터베이스에서 가져오기
        const { data: bookData, error: bookError } = await supabase
          .from("books")
          .select("*")
          .eq("id", bookId)
          .single();

        if (bookError) throw bookError;
        if (bookData) {
          setBook(bookData);
          await fetchPages(bookId);
        }
      } catch (err) {
        console.error("책 정보를 가져오는 중 오류 발생:", err);
      }
    };

    // id가 변경될 때마다 데이터 가져오기
    fetchBookAndPages(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 책보기 버튼 클릭 핸들러
  const handleStartReading = () => {
    if (pages && pages.length > 0) {
      // 첫 페이지로 이동
      navigate(`/book/${id}/read`);
    }
  };

  // 로딩 중
  if (pagesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-muted-foreground">페이지 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 에러 발생 시
  if (pagesError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <p className="text-destructive mb-2">오류가 발생했습니다</p>
            <p className="text-muted-foreground text-sm">{pagesError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {book && (
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{book.title}</h1>
          <p className="text-muted-foreground mb-4">
            저자: {book.author || "저자 미상"}
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">페이지 정보</h2>

        {pages.length === 0 ? (
          <p className="text-muted-foreground">등록된 페이지가 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {/* 전체 시간 표시 */}
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">전체 시간</span>
                <span className="text-2xl font-bold text-primary">
                  {formatTime(totalTime)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                총 {pages.length}개의 페이지
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pages.map((page) => {
                const timeData = getPageTime(page);
                const pageImageUrl = page.image_url || page.image_clean_url;

                return (
                  <div
                    key={page.id}
                    className="border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    {/* 페이지 이미지 */}
                    {pageImageUrl ? (
                      <div className="aspect-video overflow-hidden bg-muted">
                        <img
                          src={getImageUrl(pageImageUrl)}
                          alt={`페이지 ${page.page_no}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            // 이미지 로드 실패 시 정제된 이미지 URL 시도
                            if (
                              page.image_clean_url &&
                              pageImageUrl !== page.image_clean_url
                            ) {
                              e.target.src = getImageUrl(page.image_clean_url);
                            } else {
                              e.target.style.display = "none";
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="aspect-video bg-muted flex items-center justify-center">
                        <span className="text-muted-foreground text-sm">
                          이미지 없음
                        </span>
                      </div>
                    )}

                    {/* 페이지 정보 */}
                    <div className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-semibold">
                          페이지 {page.page_no}
                        </span>
                        {timeData && timeData.duration && (
                          <span className="text-sm font-semibold text-primary">
                            {formatTime(timeData.duration)}
                          </span>
                        )}
                      </div>

                      {/* 시간 정보 */}
                      {timeData && (
                        <div className="mb-2 p-2 bg-muted rounded text-xs space-y-1">
                          {timeData.start !== undefined && (
                            <div>
                              <span className="text-muted-foreground">
                                시작:{" "}
                              </span>
                              <span>{timeData.start}</span>
                            </div>
                          )}
                          {timeData.end !== undefined && (
                            <div>
                              <span className="text-muted-foreground">
                                종료:{" "}
                              </span>
                              <span>{timeData.end}</span>
                            </div>
                          )}
                          {timeData.duration !== undefined && (
                            <div>
                              <span className="text-muted-foreground">
                                소요 시간:{" "}
                              </span>
                              <span className="font-semibold">
                                {formatTime(timeData.duration)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground">
                        {new Date(page.created_at).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-border">
              <div className="flex justify-between items-center mb-4">
                <p className="text-muted-foreground">
                  총 {pages.length}개의 페이지가 있습니다.
                </p>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">전체 시간</p>
                  <p className="text-xl font-bold text-primary">
                    {formatTime(totalTime)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleStartReading}
                disabled={pages.length === 0}
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                책보기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BookView;
