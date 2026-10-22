export async function loadChallengeThumbnails({ prepare, images, thumbnail, isCurrent, onFailure }) {
  try {
    await prepare();
    if (!isCurrent()) return false;
    for (const image of images) image.src = thumbnail(image.dataset.challengeModel);
    return true;
  } catch (error) {
    if (isCurrent()) onFailure(error);
    return false;
  }
}
