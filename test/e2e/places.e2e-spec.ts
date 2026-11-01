import { API, bearer, createApp, E2EContext, seedWorld } from './helpers';
import { PlacesService } from '../../src/places/places.service';

describe('Places: one spelling per city and area', () => {
  let ctx: E2EContext;
  let w: Awaited<ReturnType<typeof seedWorld>>;
  const adm = () => ({
    get: (p: string) => ctx.http().get(`${API}/${p}`).set(bearer(w.admin)),
  });
  const interest = (email: string, city: string, neighbourhood: string, extra: object = {}) => ctx.http().post(`${API}/interest`).send({
    role: 'parent', firstName: 'Test', lastName: 'Family', email, phone: '03001234567', city, neighbourhood, ...extra,
  });

  beforeAll(async () => {
    ctx = await createApp('places', { env: { GOOGLE_MAPS_API_KEY: 'test-key' } });
    w = await seedWorld(ctx); // neighbourhood "Gulshan" in Karachi
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await ctx.close();
  });

  it('lists the cities with their areas and every district for the website form', async () => {
    const r = await ctx.http().get(`${API}/places`);
    expect(r.status).toBe(200);
    const names = r.body.data.cities.map((c: any) => c.name);
    expect(names.slice(0, 5)).toEqual(['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad']);
    const karachi = r.body.data.cities.find((c: any) => c.name === 'Karachi');
    expect(karachi.areas).toEqual(expect.arrayContaining(['North Nazimabad', 'Clifton']));
    expect(r.body.data.districts.map((p: any) => p.province)).toEqual(expect.arrayContaining(['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan']));
    expect(r.body.data.locationEnabled).toBe(true);
  });

  it('stores the tidy spelling and keeps what was typed', async () => {
    expect((await interest('a1@e2e.test', 'FAISALABAD', 'peoples colony', { district: '', province: '' })).status).toBe(201);
    await interest('a2@e2e.test', 'Faislabad', 'Peoples Colony');
    await interest('a3@e2e.test', 'karachi ', 'north NAZIMABAD', { location: { lat: 24.94123, lng: 67.04567 } });
    const rows = await ctx.db.collection('interests').find({}).sort({ email: 1 }).toArray();
    expect(rows.map((r) => r.city)).toEqual(['Faisalabad', 'Faisalabad', 'Karachi']);
    expect(rows[0]).toMatchObject({ cityRaw: 'FAISALABAD' });
    expect(rows[2]).toMatchObject({ neighbourhood: 'North Nazimabad', location: { lat: 24.94, lng: 67.05 } });
  });

  it('tidies requests saved before, once', async () => {
    await ctx.db.collection('interests').insertMany([
      { role: 'parent', firstName: 'Old', lastName: 'One', email: 'o1@e2e.test', phone: '0300', city: 'KARACHI', neighbourhood: 'gulshan', status: 'new', createdAt: new Date() },
      { role: 'parent', firstName: 'Old', lastName: 'Two', email: 'o2@e2e.test', phone: '0300', city: 'Sargodha', neighbourhood: 'Satellite Town', status: 'new', createdAt: new Date() },
      { role: 'parent', firstName: 'Old', lastName: 'Three', email: 'o3@e2e.test', phone: '0300', city: 'sargodah', neighbourhood: 'satelite town', status: 'new', createdAt: new Date() },
    ]);
    await ctx.app.get(PlacesService).onModuleInit();
    const o1 = await ctx.db.collection('interests').findOne({ email: 'o1@e2e.test' });
    expect(o1).toMatchObject({ city: 'Karachi', neighbourhood: 'Gulshan', cityRaw: 'KARACHI' }); // the programme's own neighbourhood
  });

  it('Parent Insights lists each city and area once', async () => {
    const r = await adm().get('insights/parents');
    expect(r.status).toBe(200);
    const { cities, neighbourhoods } = r.body.data.places;
    expect(cities.filter((c: string) => /fais/i.test(c))).toEqual(['Faisalabad']);
    expect(cities.filter((c: string) => /sargod/i.test(c))).toEqual(['Sargodha']);
    expect(neighbourhoods.filter((n: string) => /peoples/i.test(n))).toHaveLength(1);
    expect(neighbourhoods.filter((n: string) => /satel/i.test(n))).toHaveLength(1);
    const f = await adm().get('insights/parents?city=Faisalabad');
    expect(f.body.data.rows.length).toBe(2);
  });

  it('“Use my location” turns a point into the city and area (Google), rounded to about 1 km', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      status: 'OK',
      results: [{ address_components: [
        { long_name: 'Block 7', types: ['sublocality_level_2', 'sublocality', 'political'] },
        { long_name: 'Gulshan-e-Iqbal', types: ['sublocality_level_1', 'sublocality', 'political'] },
        { long_name: 'Karachi', types: ['locality', 'political'] },
        { long_name: 'Karachi East District', types: ['administrative_area_level_2', 'political'] },
        { long_name: 'Sindh', types: ['administrative_area_level_1', 'political'] },
      ] }],
    })) as any);
    const r = await ctx.http().get(`${API}/places/reverse?lat=24.92071&lng=67.09812`);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ city: 'Karachi', cityListed: true, area: 'Gulshan-e-Iqbal', province: 'Sindh', lat: 24.92, lng: 67.1 });
    expect((await ctx.http().get(`${API}/places/reverse?lat=500&lng=1`)).status).toBe(400);
  });

  it('admins see the rough location', async () => {
    const rows = (await adm().get('interest')).body.data;
    expect(rows.find((r: any) => r.email === 'a3@e2e.test').location).toEqual({ lat: 24.94, lng: 67.05 });
  });
});
