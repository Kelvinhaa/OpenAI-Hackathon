"use client";

import {
  AnimatePresence,
  motion,
  type TargetAndTransition,
  type Transition,
  type VariantLabels,
} from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import styles from "./RotatingText.module.css";

type MotionState = TargetAndTransition | VariantLabels;

type RotatingTextProps = {
  texts: readonly string[];
  transition?: Transition;
  initial?: MotionState;
  animate?: MotionState;
  exit?: MotionState;
  animatePresenceMode?: "sync" | "wait" | "popLayout";
  animatePresenceInitial?: boolean;
  rotationInterval?: number;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | "random" | number;
  loop?: boolean;
  auto?: boolean;
  splitBy?: "characters" | "words" | "lines" | string;
  onNext?: (index: number) => void;
  mainClassName?: string;
  splitLevelClassName?: string;
  elementLevelClassName?: string;
};

export type RotatingTextHandle = {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
};

function cn(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const RotatingText = forwardRef<RotatingTextHandle, RotatingTextProps>(function RotatingText(
  {
    texts,
    transition = { type: "spring", damping: 30, stiffness: 400 },
    initial = { y: "100%", opacity: 0 },
    animate = { y: 0, opacity: 1 },
    exit = { y: "-120%", opacity: 0 },
    animatePresenceMode = "wait",
    animatePresenceInitial = false,
    rotationInterval = 2000,
    staggerDuration = 0,
    staggerFrom = "first",
    loop = true,
    auto = true,
    splitBy = "characters",
    onNext,
    mainClassName,
    splitLevelClassName,
    elementLevelClassName,
  },
  ref,
) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const currentText = texts[currentTextIndex] ?? "";

  const splitIntoCharacters = useCallback((text: string) => {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
      return Array.from(segmenter.segment(text), (segment) => segment.segment);
    }
    return Array.from(text);
  }, []);

  const elements = useMemo(() => {
    if (splitBy === "characters") {
      const words = currentText.split(" ");
      return words.map((word, index) => ({
        characters: splitIntoCharacters(word),
        needsSpace: index !== words.length - 1,
      }));
    }
    if (splitBy === "words") {
      return currentText.split(" ").map((word, index, words) => ({
        characters: [word],
        needsSpace: index !== words.length - 1,
      }));
    }
    if (splitBy === "lines") {
      return currentText.split("\n").map((line, index, lines) => ({
        characters: [line],
        needsSpace: index !== lines.length - 1,
      }));
    }
    return currentText.split(splitBy).map((part, index, parts) => ({
      characters: [part],
      needsSpace: index !== parts.length - 1,
    }));
  }, [currentText, splitBy, splitIntoCharacters]);

  const getStaggerDelay = useCallback(
    (index: number, totalCharacters: number) => {
      if (staggerFrom === "first") return index * staggerDuration;
      if (staggerFrom === "last") return (totalCharacters - 1 - index) * staggerDuration;
      if (staggerFrom === "center") {
        return Math.abs(Math.floor(totalCharacters / 2) - index) * staggerDuration;
      }
      if (staggerFrom === "random") {
        return Math.abs(Math.floor(Math.random() * totalCharacters) - index) * staggerDuration;
      }
      return Math.abs(staggerFrom - index) * staggerDuration;
    },
    [staggerDuration, staggerFrom],
  );

  const handleIndexChange = useCallback((nextIndex: number) => {
    setCurrentTextIndex(nextIndex);
    onNext?.(nextIndex);
  }, [onNext]);

  const next = useCallback(() => {
    const nextIndex = currentTextIndex === texts.length - 1
      ? (loop ? 0 : currentTextIndex)
      : currentTextIndex + 1;
    if (nextIndex !== currentTextIndex) handleIndexChange(nextIndex);
  }, [currentTextIndex, handleIndexChange, loop, texts.length]);

  const previous = useCallback(() => {
    const previousIndex = currentTextIndex === 0
      ? (loop ? texts.length - 1 : currentTextIndex)
      : currentTextIndex - 1;
    if (previousIndex !== currentTextIndex) handleIndexChange(previousIndex);
  }, [currentTextIndex, handleIndexChange, loop, texts.length]);

  const jumpTo = useCallback((index: number) => {
    const validIndex = Math.max(0, Math.min(index, texts.length - 1));
    if (validIndex !== currentTextIndex) handleIndexChange(validIndex);
  }, [currentTextIndex, handleIndexChange, texts.length]);

  const reset = useCallback(() => {
    if (currentTextIndex !== 0) handleIndexChange(0);
  }, [currentTextIndex, handleIndexChange]);

  useImperativeHandle(ref, () => ({ next, previous, jumpTo, reset }), [jumpTo, next, previous, reset]);

  useEffect(() => {
    if (!auto) return;
    const intervalId = window.setInterval(next, rotationInterval);
    return () => window.clearInterval(intervalId);
  }, [next, rotationInterval, auto]);

  const totalCharacters = elements.reduce((total, word) => total + word.characters.length, 0);

  return (
    <motion.span
      className={cn(styles.root, mainClassName)}
      layout
      transition={transition}
      aria-live="polite"
    >
      <span className={styles.screenReader}>{currentText}</span>
      <AnimatePresence mode={animatePresenceMode} initial={animatePresenceInitial}>
        <motion.span
          key={currentTextIndex}
          className={cn(splitBy === "lines" ? styles.lines : styles.rotating)}
          layout
          aria-hidden="true"
        >
          {elements.map((word, wordIndex, words) => {
            const previousCharacters = words
              .slice(0, wordIndex)
              .reduce((total, item) => total + item.characters.length, 0);

            return (
              <span key={wordIndex} className={cn(styles.word, splitLevelClassName)}>
                {word.characters.map((character, characterIndex) => (
                  <motion.span
                    key={characterIndex}
                    initial={initial}
                    animate={animate}
                    exit={exit}
                    transition={{
                      ...transition,
                      delay: getStaggerDelay(previousCharacters + characterIndex, totalCharacters),
                    }}
                    className={cn(styles.element, elementLevelClassName)}
                  >
                    {character}
                  </motion.span>
                ))}
                {word.needsSpace && <span className={styles.space}> </span>}
              </span>
            );
          })}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
});

RotatingText.displayName = "RotatingText";

export default RotatingText;
