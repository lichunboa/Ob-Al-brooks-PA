export function calculateSm2(currentInterval: number, currentEase: number, rating: number) {
  let newInterval = 0;
  let newEase = currentEase;

  if (rating === 0) { // Again
    newInterval = 1;
    newEase = Math.max(130, currentEase - 20);
  } else if (rating === 1) { // Hard
    newInterval = Math.max(1, Math.floor(currentInterval * 1.2));
    newEase = Math.max(130, currentEase - 15);
  } else if (rating === 2) { // Good
    newInterval = Math.max(1, Math.floor(currentInterval * (currentEase / 100)));
    newEase = currentEase;
  } else if (rating === 3) { // Easy
    newInterval = Math.max(1, Math.floor(currentInterval * (currentEase / 100) * 1.3));
    newEase = Math.min(500, currentEase + 15);
  }

  return { interval: newInterval, ease: newEase };
}
