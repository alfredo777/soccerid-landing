const knex = require('./db/knex');
const bcrypt = require('bcryptjs');
(async () => {
  const existing = await knex('users').where({ email: 'leon@soccerid.co' }).first();
  if (existing) { console.log('Ya existe:', existing.id, existing.name, existing.category, existing.status); process.exit(0); }
  const tier = await knex('tiers').where({ key: 'oro', role: 'investor' }).first();
  const countRes = await knex('users').where({ role: 'investor', category: 'oro' }).count({ c: '*' }).first();
  const memberId = 'SIDC-O' + String((Number(countRes.c) || 0) + 1).padStart(2, '0');
  const hash = bcrypt.hashSync('Merol701c', 10);
  await knex('users').insert({
    name: 'León Rangel', email: 'leon@soccerid.co', role: 'investor',
    category: 'oro', amount: tier ? tier.amount : 250000,
    member_id: memberId, status: 'active', password_hash: hash, notifications_seen_id: 0
  });
  const user = await knex('users').where({ email: 'leon@soccerid.co' }).first();
  console.log('Creado:', user.id, user.name, user.member_id, user.category);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
