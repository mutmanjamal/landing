// ui.ts — English / Arabic UI strings.
// One dictionary per language. Components pick the language from the URL
// (/ar/ prefix = Arabic) so the same components render both versions.

export type Lang = 'en' | 'ar';

export function getLang(pathname: string): Lang {
  return pathname === '/ar/' || pathname.startsWith('/ar/') ? 'ar' : 'en';
}

export const ui = {
  en: {
    siteName: 'Mutman Jamalaldin',
    langLabel: 'عربي',
    skip: 'Skip to content',
    nav: { work: 'Work', stack: 'Stack', contact: 'Contact' },
    hero: {
      name: 'Mutman Jamalaldin',
      line: 'Computer science student in Kuala Lumpur. I build web and desktop software, and I pick up new tools fast.',
      intent: 'Open to remote work in web development, tech support, and more.',
      seeWork: 'See the work ↓',
      downloadCv: 'Download CV',
    },
    work: {
      heading: 'Work',
      readMore: 'Read more →',
      status: { shipped: 'shipped', 'in progress': 'in progress' },
      summaries: {
        'sudan-pos':
          'Built a multi-device restaurant POS that syncs orders live over local WiFi with no internet dependency.',
        homelab:
          'Set up and maintain a self-hosted Linux server running 8+ containerised services, managed over SSH from any device on my Tailscale network.',
        'gaming-marketplace':
          'Built a static e-commerce site for a client selling digital game cards, optimised for mobile and handed off with no framework dependency.',
        'smart-calendar':
          'Building a CLI tool that aggregates class schedules and deadlines from multiple sources into one place, with a Flask web interface for phone input.',
      },
    },
    stack: {
      heading: 'Stack',
      groups: {
        languages: 'Languages',
        environments: 'Environments',
        infrastructure: 'Infrastructure',
        data: 'Data',
        tools: 'Tools',
      },
    },
    contact: {
      heading: 'Contact',
      line: 'Looking for remote work in web development, technical support, or general tech. If something here caught your attention, write to me directly.',
      phone: 'Phone',
      location: 'Location',
      github: 'GitHub',
      downloadCv: 'Download CV',
    },
    footer: {
      education: 'Mutman Jamalaldin · UGM Centre of Foundation Studies, Kuala Lumpur (in progress)',
      built: 'Vanilla HTML, CSS, JS · Built with Astro',
    },
    project: {
      back: '← Work',
      myRole: 'My role',
      aiNote: 'AI vs me',
      links: 'Links',
    },
  },
  ar: {
    siteName: 'مؤتمن جمال الدين',
    langLabel: 'EN',
    skip: 'تخطَّ إلى المحتوى',
    nav: { work: 'الأعمال', stack: 'الأدوات', contact: 'تواصل' },
    hero: {
      name: 'مؤتمن جمال الدين',
      line: 'طالب علوم حاسوب في كوالالمبور. أبني برمجيات للويب وسطح المكتب، وأتعلم الأدوات الجديدة بسرعة.',
      intent: 'متاح للعمل عن بُعد في تطوير الويب والدعم التقني والمزيد.',
      seeWork: 'شاهد الأعمال ↓',
      downloadCv: 'تحميل السيرة الذاتية',
    },
    work: {
      heading: 'الأعمال',
      readMore: 'اقرأ المزيد ←',
      status: { shipped: 'تم التسليم', 'in progress': 'قيد التنفيذ' },
      summaries: {
        'sudan-pos':
          'نظام نقاط بيع لمطعم يعمل على عدة أجهزة ويتزامن لحظياً عبر الواي فاي المحلي دون أي اعتماد على الإنترنت.',
        homelab:
          'خادم Linux ذاتي الاستضافة يشغّل أكثر من 8 خدمات بالحاويات، يُدار عبر SSH من أي جهاز على شبكة Tailscale الخاصة بي.',
        'gaming-marketplace':
          'متجر إلكتروني ثابت لعميل يبيع بطاقات ألعاب رقمية، محسّن للجوال وسُلّم دون أي اعتماد على إطار عمل.',
        'smart-calendar':
          'أداة سطر أوامر تجمع الجداول الدراسية والمواعيد النهائية من عدة مصادر في مكان واحد، مع واجهة ويب Flask للإدخال من الهاتف.',
      },
    },
    stack: {
      heading: 'الأدوات',
      groups: {
        languages: 'لغات',
        environments: 'بيئات',
        infrastructure: 'بنية تحتية',
        data: 'بيانات',
        tools: 'أدوات',
      },
    },
    contact: {
      heading: 'تواصل',
      line: 'أبحث عن عمل عن بُعد في تطوير الويب أو الدعم التقني أو التقنية عموماً. إذا لفت انتباهك شيء هنا، راسلني مباشرة.',
      phone: 'الهاتف',
      location: 'الموقع',
      github: 'GitHub',
      downloadCv: 'تحميل السيرة الذاتية',
    },
    footer: {
      education: 'مؤتمن جمال الدين · مركز UGM للدراسات التأسيسية، كوالالمبور (قيد الدراسة)',
      built: 'HTML و CSS و JS خالصة · مبنية بـ Astro',
    },
    project: {
      back: 'العودة إلى الأعمال',
      myRole: 'دوري',
      aiNote: 'الذكاء الاصطناعي مقابل عملي',
      links: 'روابط',
    },
  },
} as const;
