export function scheduleInput(instant: string | Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
  const get = (type: string) => parts.find(part => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
export function scheduleInstant(value: string, zone: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid schedule date and time.');
  const numbers = value.split(/[-T:]/).map(Number);
  const target = Date.UTC(numbers[0],numbers[1]-1,numbers[2],numbers[3],numbers[4]);
  let guess = target;
  for (let index = 0; index < 4; index++) {
    const local = scheduleInput(new Date(guess), zone).split(/[-T:]/).map(Number);
    guess += target - Date.UTC(local[0],local[1]-1,local[2],local[3],local[4]);
  }
  if (scheduleInput(new Date(guess),zone) !== value) throw new Error('This time does not exist in the academy time zone. Choose another time.');
  return new Date(guess).toISOString();
}
