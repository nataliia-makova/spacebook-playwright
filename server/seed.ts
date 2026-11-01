import type { Database } from './db.js';
import { immediate } from './db.js';
import type { OpeningHours } from '../shared/contracts.js';

const daily = Object.fromEntries(Array.from({length:7}, (_,i) => [i+1, {opensAt:'09:00',closesAt:'20:00'}])) as OpeningHours;
const rehearsal = Object.fromEntries(Array.from({length:7}, (_,i) => [i+1, i === 6 ? null : {opensAt:'10:00', closesAt:'22:00'}])) as OpeningHours;
const podcast = Object.fromEntries(Array.from({length:7}, (_,i) => [i+1, {opensAt:'08:00',closesAt:'21:00'}])) as OpeningHours;
const spaces = [
  {id:'b74cbf47-296b-46e9-84d1-358b6ce51201', name:'Daylight Studio', type:'photography-studio', capacity:6, equipment:['Softbox lighting','Paper backdrops','Changing area'], hourlyRate:3000, openingHours:daily, imageUrl:'/images/daylight-studio.webp'},
  {id:'b74cbf47-296b-46e9-84d1-358b6ce51202', name:'The Rehearsal Room', type:'rehearsal-room', capacity:8, equipment:['Drum kit','PA system','Microphones'], hourlyRate:4500, openingHours:rehearsal, imageUrl:'/images/rehearsal-room.svg'},
  {id:'b74cbf47-296b-46e9-84d1-358b6ce51203', name:'Voice & Sound Booth', type:'podcast-booth', capacity:3, equipment:['Recording microphones','Headphones','Acoustic panels'], hourlyRate:2500, openingHours:podcast, imageUrl:'/images/podcast-booth.svg'}
];
export function seed(db: Database): void {
  immediate(db, () => {
    const insert = db.prepare(`INSERT OR IGNORE INTO spaces
      (id,name,type,capacity,equipment_json,hourly_rate,opening_hours_json,image_url)
      VALUES (?,?,?,?,?,?,?,?)`);
    for (const s of spaces) insert.run(s.id,s.name,s.type,s.capacity,JSON.stringify(s.equipment),s.hourlyRate,JSON.stringify(s.openingHours),s.imageUrl);
  });
}
