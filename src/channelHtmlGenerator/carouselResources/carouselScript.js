const scriptText = (assets) => {
    let currentIndex = 0;
    const parseStartDateString = (dateString, isGMT) => {
        if (!dateString) {
            return new Date();
        }
        return parseDateString(dateString, isGMT);
    }
    const parseEndDateString = (dateString, isGMT) => {
        if (!dateString) {
            const date = new Date();
            date.setFullYear(date.getFullYear() + 10);
            return date;
        }
        return parseDateString(dateString, isGMT);
    }
    const parseStartTimeString = (timeString, isGMT) => {
        if (!timeString) {
            return new Date();
        }
        return parseTimeString(timeString, isGMT);
    }
    const parseEndTimeString = (timeString, isGMT) => {
        if (!timeString) {
            const date = new Date();
            date.setFullYear(date.getFullYear() + 10);
            return date;
        }
        return parseTimeString(timeString, isGMT);
    }

    const parseDateString = (dateString, isGMT) => {
        const dateParts = dateString.split('/');
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        if (isGMT) {
            return new Date(Date.UTC(year, month, day));
        }
        return new Date(year, month, day);
    }
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
    }
    function playAds() {
        const container = document.getElementById('carousel-container');
        while (currentIndex < assets.length) {
            const asset = assets[currentIndex];
            const launchStartDate = parseStartDateString(asset.launchStartDate, asset.isGMT);
            const launchEndDate = parseEndDateString(asset.launchEndDate, asset.isGMT);
            const startTime = parseStartTimeString(asset.startTime, asset.isGMT);
            const endTime = parseEndTimeString(asset.endTime, asset.isGMT);
            const now = new Date();
            console.log(`lsd-${launchStartDate}, \n led-${launchEndDate}, \n st-${startTime}, \n et-${endTime}`);
            if (now >= launchStartDate && now <= launchEndDate
                && now >= startTime && now <= endTime) {
                if (asset.type === 'image') {
                    const img = new Image();
                    img.src = asset.link;
                    img.onerror = function() {
                        incrementAdIndex();
                        playAds();
                    };
                    img.onload = function() {
                        container.innerHTML = '';
                        container.appendChild(img);
                        setTimeout(() => {
                            img.classList.add('visible');
                            setTimeout(() => {
                                img.classList.remove('visible');
                                container.removeChild(img);
                                incrementAdIndex();
                                playAds();
                            }, 5000);
                        }, 10);
                    };
                    break;
                } else if (asset.type === 'video') {
                    const video = document.createElement('video');
                    video.src = asset.link;
                    video.onerror = function() {
                        incrementAdIndex();
                        playAds();
                    };
                    video.onended = function() {
                        video.classList.remove('visible');
                        setTimeout(() => {
                            container.removeChild(video);
                            incrementAdIndex();
                            playAds();
                        }, 10);
                    };
                    video.oncanplay = function() {
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
    function incrementAdIndex() {
        currentIndex = (currentIndex + 1) % assets.length;
    }
    playAds();
}

export { scriptText };
