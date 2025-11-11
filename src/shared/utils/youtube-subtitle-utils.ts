export interface CaptionTrack {
  languageCode: string;
  name: string;
  kind?: 'asr' | 'forced';
}

export interface ReuseCheckResult {
  canReuse: boolean;
  targetTrack?: CaptionTrack;
}

const getBaseLangCode = (langCode: string | undefined): string => {
  if (!langCode || langCode.trim() === '' || langCode === 'auto') {
    return 'auto';
  }
  return langCode.split('-')[0].toLowerCase();
};

/**
 * 判断是否可以直接复用YouTube提供的同目标语言字幕
 */
export function canReuseYouTubeTranslation(
  captionTracks: CaptionTrack[] | undefined,
  sourceLanguageCode: string,
  sourceKind: string | undefined,
  targetLanguageCode: string
): ReuseCheckResult {
  if (!captionTracks || captionTracks.length === 0) {
    return { canReuse: false };
  }

  // 源语言必须是手动字幕
  if (sourceKind === 'asr') {
    console.debug('[debug][youtube-subtitle-utils] 源语言是ASR字幕，跳过原生字幕复用');
    return { canReuse: false };
  }

  const sourceBase = getBaseLangCode(sourceLanguageCode);
  const targetBase = getBaseLangCode(targetLanguageCode);

  if (sourceBase === 'auto' || targetBase === 'auto') {
    console.debug('[debug][youtube-subtitle-utils] 语言代码不完整，跳过原生字幕复用');
    return { canReuse: false };
  }

  if (sourceBase === targetBase) {
    console.debug('[debug][youtube-subtitle-utils] 源语言与目标语言属于同一语言族，跳过原生字幕复用');
    return { canReuse: false };
  }

  const normalizedTargetTrack = captionTracks.find(track => {
    const trackBase = getBaseLangCode(track.languageCode);
    if (trackBase !== targetBase) {
      return false;
    }
    return track.kind !== 'asr';
  });

  if (!normalizedTargetTrack) {
    console.debug('[debug][youtube-subtitle-utils] 未找到符合条件的目标语言手动字幕，跳过原生字幕复用');
    return { canReuse: false };
  }

  console.log(`[youtube-subtitle-utils] ✓ 可以复用YouTube字幕: ${sourceLanguageCode} → ${normalizedTargetTrack.languageCode}`);
  return {
    canReuse: true,
    targetTrack: normalizedTargetTrack
  };
}
