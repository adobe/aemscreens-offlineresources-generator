export default async function scriptText(assets) {
  let currentIndex = 0;

  const parseDateString = (dateString, isGMT) => {
    const dateParts = dateString.split('/');
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);
    if (isGMT) {
      return new Date(Date.UTC(year, month, day));
    }
    return new Date(year, month, day);
  };

  const parseTimeString = (timeString, isGMT) => {
    const parts = timeString.split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2].split(' ')[0], 10);
    const isPM = (timeString.indexOf('PM') > -1);
    if (isPM && hours < 12) {
      hours += 12;
    }
    if (!isPM && hours === 12) {
      hours -= 12;
    }
    const dateObj = new Date();
    if (isGMT) {
      dateObj.setUTCHours(hours);
      dateObj.setUTCMinutes(minutes);
      dateObj.setUTCSeconds(seconds);
    } else {
      dateObj.setHours(hours);
      dateObj.setMinutes(minutes);
      dateObj.setSeconds(seconds);
    }
    return dateObj;
  };

  const parseStartDateString = (dateString, isGMT) => {
    if (!dateString) {
      return new Date();
    }
    return parseDateString(dateString, isGMT);
  };

  const parseEndDateString = (dateString, isGMT) => {
    if (!dateString) {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 10);
      return date;
    }
    return parseDateString(dateString, isGMT);
  };

  const parseStartTimeString = (timeString, isGMT) => {
    if (!timeString) {
      return new Date();
    }
    return parseTimeString(timeString, isGMT);
  };

  const parseEndTimeString = (timeString, isGMT) => {
    if (!timeString) {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 10);
      return date;
    }
    return parseTimeString(timeString, isGMT);
  };

  const checkForPlayableAssets = async (assetsArray = []) => {
    if (assetsArray.length === 0) {
      return;
    }
    let isActive = false;
    assetsArray.forEach((asset) => {
      const launchStartDate = parseStartDateString(asset.launchStartDate, asset.isGMT);
      const launchEndDate = parseEndDateString(asset.launchEndDate, asset.isGMT);
      const startTime = parseStartTimeString(asset.startTime, asset.isGMT);
      const endTime = parseEndTimeString(asset.endTime, asset.isGMT);
      const now = new Date();
      if (now >= launchStartDate && now <= launchEndDate
        && now >= startTime && now <= endTime) {
        isActive = true;
      }
    });
    if (!isActive) {
      await new Promise((r) => setTimeout(r, 5000));
      await checkForPlayableAssets(assetsArray);
    }
  };

  const incrementAdIndex = () => {
    currentIndex = (currentIndex + 1) % assets.length;
  };

  async function playAds() {
    const container = document.getElementById('carousel-container');
    await checkForPlayableAssets(assets);
    while (currentIndex < assets.length) {
      const asset = assets[currentIndex];
      const launchStartDate = parseStartDateString(asset.launchStartDate, asset.isGMT);
      const launchEndDate = parseEndDateString(asset.launchEndDate, asset.isGMT);
      const startTime = parseStartTimeString(asset.startTime, asset.isGMT);
      const endTime = parseEndTimeString(asset.endTime, asset.isGMT);
      const now = new Date();
      if (now >= launchStartDate && now <= launchEndDate
        && now >= startTime && now <= endTime) {
        if (asset.type === 'image') {
          const img = new Image();
          img.src = asset.link;
          img.onerror = () => {
            setTimeout(() => {
              incrementAdIndex();
              playAds();
            }, 100);
          };
          img.onload = () => {
            container.innerHTML = '';
            container.appendChild(img);
            setTimeout(() => {
              img.classList.add('visible');
              setTimeout(() => {
                img.classList.remove('visible');
                container.removeChild(img);
                incrementAdIndex();
                playAds();
              }, 8000);
            }, 10);
          };
          break;
        } else if (asset.type === 'video') {
          const video = document.createElement('video');
          video.src = asset.link;
          video.onerror = () => {
            setTimeout(() => {
              incrementAdIndex();
              playAds();
            }, 100);
          };
          video.onended = () => {
            video.classList.remove('visible');
            setTimeout(() => {
              container.removeChild(video);
              incrementAdIndex();
              playAds();
            }, 10);
          };
          video.oncanplay = () => {
            container.innerHTML = '';
            container.appendChild(video);
            video.play();
            setTimeout(() => {
              video.classList.add('visible');
            }, 10);
          };
          video.muted = true;
          video.playsInline = true;
          break;
        }
      } else {
        incrementAdIndex();
      }
    }
  }
  playAds();
}
