import React, { useEffect, useState } from "react";

const WORDS = [
  "computational immunologist",
  "medical student",
  "Oxford researcher",
];

const TypewriterText: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const currentWord = WORDS[wordIndex];

    if (!isDeleting && charIndex < currentWord.length) {
      const timer = setTimeout(() => {
        setCharIndex((prev) => prev + 1);
        setText(currentWord.substring(0, charIndex + 1));
      }, 70);
      return () => clearTimeout(timer);
    }

    if (isDeleting && charIndex > 0) {
      const timer = setTimeout(() => {
        setCharIndex((prev) => prev - 1);
        setText(currentWord.substring(0, charIndex - 1));
      }, 40);
      return () => clearTimeout(timer);
    }

    if (isDeleting) {
      setIsDeleting(false);
      setWordIndex((wordIndex + 1) % WORDS.length);
      setCharIndex(0);
      const timer = setTimeout(() => setText(""), 200);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => setIsDeleting(true), 1400);
    return () => clearTimeout(timer);
  }, [mounted, wordIndex, charIndex, isDeleting]);

  if (!mounted) {
    return (
      <span className="text-muted">
        computational immunologist
        <span className="ml-0.5 text-accent cursor-blink" aria-hidden="true">
          ▋
        </span>
      </span>
    );
  }

  return (
    <span className="text-muted">
      {text}
      <span className="ml-0.5 text-accent cursor-blink" aria-hidden="true">
        ▋
      </span>
    </span>
  );
};

export default TypewriterText;
