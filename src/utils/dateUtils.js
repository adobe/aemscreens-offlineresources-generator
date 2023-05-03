export default class DateUtils {
  static validateDateFormat = (date) => {
    if (!date) {
      return;
    }
    const dateFormatRegex = /^(0?[1-9]|[1-2][0-9]|3[0-1])\/(0?[1-9]|1[0-2])\/([0-9]{4})$/;
    if (!dateFormatRegex.test(date)) {
      throw new Error(`Invalid date format: ${date}`);
    }
  };

  static validateTimeFormat = (time) => {
    if (!time) {
      return;
    }
    const timeFormatRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]:[0-5][0-9]\s(AM|PM)$/;
    if (!timeFormatRegex.test(time)) {
      throw new Error(`Invalid time format: ${time}`);
    }
  };

  static isGMT = (timezone) => timezone && timezone.toLowerCase() === 'gmt';
}
