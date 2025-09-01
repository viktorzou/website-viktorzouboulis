import React, { useEffect, useState } from 'react';

const TypewriterText: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState('');
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  const words = [
    'Aspiring Doctor',
    'Computational Immunologist', 
    'Digital Health Enthusiast'
  ];

  useEffect(() => {
    setMounted(true);
    console.log('TypewriterText mounted, starting with empty text');
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const currentWord = words[wordIndex];
    
    if (!isDeleting && charIndex < currentWord.length) {
      // Typing
      const timer = setTimeout(() => {
        setText(currentWord.substring(0, charIndex + 1));
        setCharIndex(charIndex + 1);
      }, 100);
      return () => clearTimeout(timer);
    } else if (isDeleting && charIndex > 0) {
      // Deleting
      const timer = setTimeout(() => {
        setText(currentWord.substring(0, charIndex - 1));
        setCharIndex(charIndex - 1);
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Switch modes or move to next word
      if (isDeleting) {
        // Finished deleting, move to next word
        setIsDeleting(false);
        setWordIndex((wordIndex + 1) % words.length);
        setCharIndex(0);
        const timer = setTimeout(() => {
          setText('');
        }, 300);
        return () => clearTimeout(timer);
      } else {
        // Finished typing, start deleting
        setIsDeleting(true);
        const timer = setTimeout(() => {
          // Wait before starting to delete
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [mounted, text, wordIndex, charIndex, isDeleting, words]);

  if (!mounted) {
    return null; // Don't render anything until mounted
  }

  return (
    <div className="typewriter-container">
      <span className="text-xl md:text-2xl text-slate-600 dark:text-slate-300">
        {text}
        <span className="text-blue-600 dark:text-blue-400 animate-pulse">|</span>
      </span>
    </div>
  );
};

export default TypewriterText;
