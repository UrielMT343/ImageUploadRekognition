// RecentImagesCarousel.tsx
"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type RecentImage = {
    key: string;
    url: string;
    lastModified: string;
    imageId: string;
    processedKey: string;
};

export default function RecentImagesCarousel({
    items,
    onSelect,
    selectedKey,
}: {
    items: RecentImage[];
    onSelect: (it: RecentImage) => void;
    selectedKey?: string;
}) {
    const scroller = useRef<HTMLDivElement>(null);
    const [isAtStart, setIsAtStart] = useState(true);
    const [isAtEnd, setIsAtEnd] = useState(false);

    const handleScroll = (direction: "left" | "right") => {
        if (scroller.current) {
            const scrollAmount = scroller.current.clientWidth * 0.8;
            scroller.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
            });
        }
    };

    const checkScrollPosition = useCallback(() => {
        if (scroller.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scroller.current;
            setIsAtStart(scrollLeft === 0);
            setIsAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
        }
    }, []);

    useEffect(() => {
        const scrollerElement = scroller.current;
        if (scrollerElement) {
            checkScrollPosition();
            scrollerElement.addEventListener("scroll", checkScrollPosition);
            window.addEventListener("resize", checkScrollPosition);

            return () => {
                scrollerElement.removeEventListener("scroll", checkScrollPosition);
                window.removeEventListener("resize", checkScrollPosition);
            };
        }
    }, [items, checkScrollPosition]);

    if (!items || items.length === 0) {
        return null;
    }

    return (
        <div className="w-full max-w-3xl mx-auto relative">
            {/* Left Arrow */}
            {!isAtStart && (
                <button
                    onClick={() => handleScroll("left")}
                    className="absolute top-1/2 left-0 z-10 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-all"
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={24} />
                </button>
            )}

            <div
                ref={scroller}
                className="flex gap-4 overflow-x-auto py-2 scrollbar-hide"
                role="list"
                aria-label="Recent processed images"
            >
                {items.map((it) => (
                    <button
                        key={it.key}
                        onClick={() => onSelect(it)}
                        className={`shrink-0 border-2 rounded-lg p-1 transition-all duration-200 ease-in-out focus:outline-none 
                          ${selectedKey === it.processedKey
                            ? "border-blue-500 scale-105"
                            : "border-transparent hover:scale-105 hover:border-gray-500"
                          }`}
                        aria-label={`Open ${it.imageId}`}
                        title={new Date(it.lastModified).toLocaleString()}
                        role="listitem"
                    >
                        <Image
                            src={it.url}
                            alt={it.imageId}
                            className="h-24 w-24 object-cover rounded-md"
                            width={96}
                            height={96}
                        />
                    </button>
                ))}
            </div>

            {/* Right Arrow */}
            {!isAtEnd && (
                 <button
                    onClick={() => handleScroll("right")}
                    className="absolute top-1/2 right-0 z-10 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-all"
                    aria-label="Scroll right"
                >
                    <ChevronRight size={24} />
                </button>
            )}
        </div>
    );
}