import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReaderStore } from "../../store/useReaderStroe";
import supabase from "../../utils/supabase";

function BookReaderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    book,
    pages,
    currentPage,
    pagesLoading,
    pagesError,
    fetchPages,
    setBook,
    setCurrentPage,
  } = useReaderStore();

  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentSentences, setCurrentSentences] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [previousSentences, setPreviousSentences] = useState([]);
  const [audioFiles, setAudioFiles] = useState({});
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioLoadingProgress, setAudioLoadingProgress] = useState(0);
  const [activeAudio, setActiveAudio] = useState(null);
  const intervalRef = useRef(null);
  const progressRef = useRef(0);
  const startTimerRef = useRef(null);
  const finishTimerRef = useRef(null);
  const audioRefs = useRef({});
  const currentSentencesRef = useRef([]);
  const activeAudioRef = useRef(null);

  useEffect(() => {
    // 책 정보와 페이지 목록 가져오기
    if (id) {
      fetchBookAndPages(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // pages가 로드되면 음성 파일 미리 로드
  useEffect(() => {
    if (
      pages &&
      pages.length > 0 &&
      book &&
      book.id &&
      !isAudioLoading &&
      Object.keys(audioFiles).length === 0
    ) {
      preloadAudioFiles(pages, book.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, book]);

  // 책 정보와 페이지를 가져오는 함수
  const fetchBookAndPages = async (bookId) => {
    try {
      // 책 정보 가져오기
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

  // text JSON에서 sentences 배열 파싱
  const parseSentences = useCallback((page) => {
    if (!page || !page.text) return null;

    try {
      const textData =
        typeof page.text === "string" ? JSON.parse(page.text) : page.text;

      // sentences 배열이 있는지 확인
      if (
        textData &&
        Array.isArray(textData.sentences) &&
        textData.sentences.length > 0
      ) {
        return textData.sentences.map((sentence) => {
          const startTime = sentence.s || 0;
          const endTime = sentence.e || 0;
          const text = sentence.text || sentence.t || "";
          const sound = sentence.sound || null;

          // 밀리초인 경우 초로 변환
          const startInSeconds =
            startTime > 1000 ? startTime / 1000 : startTime;
          const endInSeconds = endTime > 1000 ? endTime / 1000 : endTime;

          return {
            text,
            sound,
            start: startInSeconds,
            end: endInSeconds,
            duration: endInSeconds - startInSeconds,
          };
        });
      }
    } catch (err) {
      console.error("sentences 파싱 오류:", err);
    }

    return null;
  }, []);

  // 음성 파일 URL 생성
  const getSoundUrl = useCallback((soundPath, bookId) => {
    if (!soundPath) return null;

    // 이미 전체 URL인 경우
    if (soundPath.startsWith("http://") || soundPath.startsWith("https://")) {
      return soundPath;
    }

    // 파일명만 있는 경우 (예: "02_01.mp3")
    let fileName = soundPath.trim();
    if (fileName.startsWith("/")) {
      fileName = fileName.slice(1);
    }

    // books/{book_id}/sound/{파일명} 형식으로 경로 생성
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/books/${bookId}/sound/${fileName}`;
  }, []);

  // 모든 페이지의 음성 파일 미리 로드
  const preloadAudioFiles = useCallback(
    async (pages, bookId) => {
      if (!pages || pages.length === 0 || !bookId) return;

      setIsAudioLoading(true);
      setAudioLoadingProgress(0);

      const allSounds = new Set();
      const audioMap = {};

      // 모든 sentences에서 sound 추출
      pages.forEach((page) => {
        const sentences = parseSentences(page);
        if (sentences) {
          sentences.forEach((sentence) => {
            if (sentence.sound) {
              allSounds.add(sentence.sound);
            }
          });
        }
      });

      const soundArray = Array.from(allSounds);
      const totalSounds = soundArray.length;

      if (totalSounds === 0) {
        setIsAudioLoading(false);
        return;
      }

      // 각 음성 파일 로드
      for (let i = 0; i < soundArray.length; i++) {
        const soundPath = soundArray[i];
        const soundUrl = getSoundUrl(soundPath, bookId);

        if (soundUrl) {
          try {
            const audio = new Audio(soundUrl);
            audio.preload = "auto";

            await new Promise((resolve, reject) => {
              audio.addEventListener("canplaythrough", resolve, { once: true });
              audio.addEventListener("error", reject, { once: true });
              audio.load();
            });

            audioMap[soundPath] = audio;
            setAudioLoadingProgress(((i + 1) / totalSounds) * 100);
          } catch (err) {
            console.error(`음성 파일 로드 실패: ${soundPath}`, err);
          }
        }
      }

      setAudioFiles(audioMap);
      setIsAudioLoading(false);
    },
    [parseSentences, getSoundUrl]
  );

  // text JSON에서 sentences 배열의 s, e 값을 추출하고 시간을 계산하는 함수
  const getPageTime = useCallback(
    (page) => {
      const sentences = parseSentences(page);
      if (!sentences || sentences.length === 0) return null;

      const minStart = Math.min(...sentences.map((s) => s.start));
      const maxEnd = Math.max(...sentences.map((s) => s.end));
      const duration = maxEnd - minStart;

      return duration > 0 ? duration : null;
    },
    [parseSentences]
  );

  // 다음 페이지로 이동
  const goToNextPage = useCallback(() => {
    if (!currentPage || !pages || pages.length === 0) return;

    const currentIndex = pages.findIndex((p) => p.id === currentPage.id);
    if (currentIndex < pages.length - 1) {
      setCurrentPage(pages[currentIndex + 1]);
      setProgress(0);
      progressRef.current = 0;
    } else {
      // 마지막 페이지면 종료 상태로
      setIsFinished(true);
      // 5초 후 자동 닫기
      finishTimerRef.current = setTimeout(() => {
        navigate(`/book/${id}`);
      }, 5000);
    }
  }, [currentPage, pages, setCurrentPage, navigate, id]);

  // 시작 버튼 클릭 핸들러
  const handleStart = useCallback(() => {
    setIsStarted(true);
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
  }, []);

  // 종료 버튼 클릭 핸들러
  const handleFinish = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    navigate(`/book/${id}`);
  }, [navigate, id]);

  // 시작 타이머 (5초 후 자동 시작, 음성 로드 완료 후)
  useEffect(() => {
    if (
      !pagesLoading &&
      pages &&
      pages.length > 0 &&
      !isStarted &&
      !isAudioLoading
    ) {
      // 음성 파일이 없어도 시작 가능
      const hasAudio = Object.keys(audioFiles).length > 0;
      if (!hasAudio) {
        // 음성 파일이 없으면 바로 타이머 시작
        startTimerRef.current = setTimeout(() => {
          setIsStarted(true);
        }, 5000);
      } else {
        // 음성 파일이 있으면 로드 완료 후 타이머 시작
        startTimerRef.current = setTimeout(() => {
          setIsStarted(true);
        }, 5000);
      }

      return () => {
        if (startTimerRef.current) {
          clearTimeout(startTimerRef.current);
          startTimerRef.current = null;
        }
      };
    }
  }, [pagesLoading, pages, isStarted, isAudioLoading, audioFiles]);

  // 진행 바 시작 및 sentences 표시
  useEffect(() => {
    if (!currentPage || !isStarted) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (!isStarted) {
        setElapsedTime(0);
        setCurrentSentences([]);
        currentSentencesRef.current = [];
      }
      return;
    }

    // 일시정지 상태일 때는 진행만 멈추고 sentences는 유지
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // 오디오도 일시정지
      if (activeAudioRef.current && !activeAudioRef.current.paused) {
        activeAudioRef.current.pause();
      }
      return;
    }

    // 재생 상태일 때 오디오도 재생
    if (
      activeAudioRef.current &&
      activeAudioRef.current.paused &&
      currentSentencesRef.current.length > 0
    ) {
      const currentSentence = currentSentencesRef.current.find((s) => s.sound);
      if (
        currentSentence &&
        currentSentence.sound &&
        activeAudioRef.current.src.includes(currentSentence.sound)
      ) {
        activeAudioRef.current.play().catch((err) => {
          console.error("음성 재생 실패:", err);
        });
      }
    }

    const sentences = parseSentences(currentPage);
    const duration = getPageTime(currentPage);

    if (!duration || duration <= 0 || !sentences || sentences.length === 0) {
      // 시간 정보가 없으면 3초 후 다음 페이지로
      const timeout = setTimeout(() => {
        goToNextPage();
      }, 3000);
      return () => clearTimeout(timeout);
    }

    // 진행 바 업데이트 및 sentences 표시 (100ms마다)
    const interval = setInterval(() => {
      progressRef.current += 0.1; // 100ms = 0.1초
      const newElapsedTime = progressRef.current;
      const newProgress = (newElapsedTime / duration) * 100;

      // 현재 시간에 맞는 sentences 찾기
      const activeSentences = sentences.filter(
        (sentence) =>
          newElapsedTime >= sentence.start && newElapsedTime <= sentence.end
      );

      // 이전 sentences와 비교하여 변경사항이 있을 때만 업데이트
      const hasChanged =
        activeSentences.length !== currentSentencesRef.current.length ||
        activeSentences.some(
          (s, i) =>
            !currentSentencesRef.current[i] ||
            s.start !== currentSentencesRef.current[i].start ||
            s.end !== currentSentencesRef.current[i].end
        );

      if (hasChanged) {
        // 이전 오디오 정지
        if (activeAudioRef.current) {
          activeAudioRef.current.pause();
          activeAudioRef.current.currentTime = 0;
          activeAudioRef.current = null;
          setActiveAudio(null);
        }

        // 새로운 sentences의 음성 재생
        const newSentence = activeSentences.find((s) => s.sound);
        if (newSentence && newSentence.sound && audioFiles[newSentence.sound]) {
          const audio = audioFiles[newSentence.sound];
          audio.currentTime = 0;
          audio.play().catch((err) => {
            console.error("음성 재생 실패:", err);
          });
          activeAudioRef.current = audio;
          setActiveAudio(audio);
        }

        setPreviousSentences([...currentSentencesRef.current]);
        currentSentencesRef.current = activeSentences;
        setCurrentSentences(activeSentences);
      }
      setElapsedTime(newElapsedTime);

      if (newProgress >= 100) {
        setProgress(100);
        setElapsedTime(duration);
        // 마지막 sentences 표시
        const lastSentences = sentences.filter(
          (sentence) => sentence.end >= duration
        );
        currentSentencesRef.current = lastSentences;
        setCurrentSentences(lastSentences);

        clearInterval(intervalRef.current);
        intervalRef.current = null;
        // 다음 페이지로 이동 (2초 딜레이)
        setTimeout(() => {
          goToNextPage();
        }, 2000);
      } else {
        setProgress(newProgress);
      }
    }, 100);

    intervalRef.current = interval;

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    currentPage,
    isPaused,
    isStarted,
    getPageTime,
    parseSentences,
    goToNextPage,
    audioFiles,
  ]);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
      }
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // 페이지 변경 시 진행 바 리셋 및 오디오 정지
  useEffect(() => {
    setProgress(0);
    progressRef.current = 0;
    setElapsedTime(0);
    setCurrentSentences([]);
    currentSentencesRef.current = [];
    setIsFinished(false);

    // 현재 재생 중인 오디오 정지
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
      setActiveAudio(null);
    }
  }, [currentPage?.id]);

  // 로딩 중
  if (pagesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-muted-foreground">페이지를 불러오는 중...</p>
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
            <button
              onClick={() => navigate(`/book/${id}`)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 페이지가 없을 때
  if (!currentPage || pages.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            표시할 페이지가 없습니다.
          </p>
          <button
            onClick={() => navigate(`/book/${id}`)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  const pageImageUrl = currentPage.image_url || currentPage.image_clean_url;
  const pageDuration = getPageTime(currentPage);
  const currentIndex = pages.findIndex((p) => p.id === currentPage.id);

  // 시작 전 화면
  if (!isStarted) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        {/* 배경 이미지 */}
        {pageImageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${getImageUrl(pageImageUrl)})`,
            }}
          >
            {/* 어두운 오버레이 */}
            <div className="absolute inset-0 bg-black/50" />
          </div>
        )}

        <div className="relative h-full flex items-center justify-center">
          <div className="text-center z-10">
            <h2 className="text-4xl font-bold text-white mb-8">
              {book?.title || "책 읽기"}
            </h2>

            {isAudioLoading ? (
              <div className="space-y-4">
                <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden mx-auto">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${audioLoadingProgress}%` }}
                  />
                </div>
                <p className="text-white/70 text-sm">
                  음성 파일을 로드하는 중... {Math.floor(audioLoadingProgress)}%
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleStart}
                  disabled={isAudioLoading}
                  className="px-8 py-4 bg-primary text-primary-foreground text-xl font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  시작하기
                </button>
                <p className="text-white/70 mt-4 text-sm">
                  {isAudioLoading
                    ? "음성 파일 로딩 중..."
                    : "5초 후 자동으로 시작됩니다"}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 종료 화면
  if (isFinished) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        {/* 배경 이미지 */}
        {pageImageUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${getImageUrl(pageImageUrl)})`,
            }}
          >
            {/* 어두운 오버레이 */}
            <div className="absolute inset-0 bg-black/50" />
          </div>
        )}

        <div className="relative h-full flex items-center justify-center">
          <div className="text-center z-10">
            <h2 className="text-4xl font-bold text-white mb-4">읽기 완료!</h2>
            <p className="text-white/80 mb-8 text-lg">
              모든 페이지를 읽었습니다
            </p>
            <button
              onClick={handleFinish}
              className="px-8 py-4 bg-primary text-primary-foreground text-xl font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-lg"
            >
              종료하기
            </button>
            <p className="text-white/70 mt-4 text-sm">
              5초 후 자동으로 닫힙니다
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* 배경 이미지 */}
      {pageImageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${getImageUrl(pageImageUrl)})`,
          }}
        >
          {/* 어두운 오버레이 */}
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {/* 컨텐츠 */}
      <div className="relative h-full flex flex-col">
        {/* 상단 컨트롤 바 */}
        <div className="relative z-10 p-4 bg-black/50 backdrop-blur-sm">
          <div className="flex justify-between items-center">
            <div className="text-white flex items-center gap-4">
              {book && (
                <>
                  <h1 className="text-xl font-bold">{book.title}</h1>
                  <p className="text-sm text-white/80">
                    페이지 {currentPage.page_no} / {pages.length}
                  </p>
                  {/* 진행 정보 */}
                  {pageDuration && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold text-white">
                        {Math.floor(progress)}%
                      </span>
                      <span className="text-white/50">|</span>
                      <span className="text-white/70">
                        {Math.floor((pageDuration * progress) / 100)}초
                      </span>
                      <span className="text-white/50">/</span>
                      <span className="text-white/70">
                        {Math.floor(pageDuration)}초
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 backdrop-blur-sm"
              >
                {isPaused ? "재생" : "일시정지"}
              </button>
              <button
                onClick={() => navigate(`/book/${id}`)}
                className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 backdrop-blur-sm"
              >
                종료
              </button>
            </div>
          </div>
        </div>

        {/* 중앙 컨텐츠 영역 */}
        <div className="flex-1 flex items-center justify-center p-8">
          {/* sentences 텍스트 표시 */}
          <div className="relative z-10 max-w-4xl mx-auto text-center">
            <div className="space-y-6 min-h-[200px] flex flex-col justify-center">
              {currentSentences.map((sentence, index) => (
                <p
                  key={`${sentence.start}-${sentence.end}-${index}`}
                  className="sentence-text text-white text-3xl md:text-4xl lg:text-5xl font-medium leading-relaxed drop-shadow-2xl"
                  style={{
                    animation: "sentenceFadeIn 0.5s ease-in-out forwards",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  {sentence.text}
                </p>
              ))}
            </div>
          </div>

          {/* 이미지가 없고 sentences도 없을 때 */}
          {!pageImageUrl && currentSentences.length === 0 && (
            <div className="text-center text-white">
              <p className="text-lg">이미지가 없습니다</p>
            </div>
          )}
        </div>

        {/* 하단 진행 바 */}
        <div className="relative z-10 pb-[5px]">
          {pageDuration ? (
            <div className="h-1 bg-white/20">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : (
            <div className="h-1 bg-white/20">
              <div className="h-full bg-white/30 animate-pulse" />
            </div>
          )}
        </div>

        {/* 하단 네비게이션 */}
        <div className="relative z-10 p-4 bg-black/50 backdrop-blur-sm">
          <div className="flex justify-between items-center">
            <button
              onClick={() => {
                const prevIndex = currentIndex - 1;
                if (prevIndex >= 0) {
                  setCurrentPage(pages[prevIndex]);
                  setProgress(0);
                  progressRef.current = 0;
                }
              }}
              disabled={currentIndex === 0}
              className="px-6 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
            >
              이전
            </button>

            <span className="text-white font-semibold">
              {currentIndex + 1} / {pages.length}
            </span>

            <button
              onClick={goToNextPage}
              disabled={currentIndex === pages.length - 1}
              className="px-6 py-3 bg-white/20 text-white rounded-lg hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
            >
              다음
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BookReaderView;
